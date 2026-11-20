import os
from datetime import datetime, timedelta, timezone

import jwt
from jwt import PyJWKClient
from dotenv import load_dotenv
from fastapi import HTTPException, status
from pydantic import BaseModel

from ..utils import logger
from .config import DEFAULT_TOKEN_SECRET, global_args
from .passwords import BCRYPT_PASSWORD_PREFIX, verify_password

# use the .env that is inside the current folder
# allows to use different .env file for each lightrag instance
# the OS environment variables take precedence over the .env file
load_dotenv(dotenv_path=".env", override=False)

# A syntactically valid bcrypt spec used only to equalize login timing (see
# AuthHandler.verify_password). It is a bcrypt hash of a throwaway value that
# never matches any real password, and it is not a secret. Every login path
# runs exactly one bcrypt verification (a real one for {bcrypt} accounts, this
# dummy for unknown usernames and for plaintext accounts) so response time does
# not reveal whether an account exists or whether it is stored as plaintext
# (username enumeration via the ~100 ms bcrypt delay, CWE-208).
#
# The cost factor is 12, matching hash_password()/bcrypt.gensalt() defaults.
# Accounts stored with a hand-chosen, different bcrypt cost will still differ
# somewhat; fully closing that gap requires enforcing a uniform cost (or
# dropping plaintext support altogether). See GHSA-c759-cx9p-mrwq.
_DUMMY_VERIFY_SPEC = (
    BCRYPT_PASSWORD_PREFIX
    + "$2b$12$ilI0sY2jGfy4h0AVtn6WuutU6BFwzZq5MVvrQYY9fbyQ59NI2NBKa"
)


# Upper bound on the JWT "sub" (username) claim accepted by validate_token.
# Deliberately generous: real subjects are either the literal "guest" or a key
# of AUTH_ACCOUNTS, both far shorter. The bound exists so an attacker-forged
# claim cannot be used as an arbitrarily large payload downstream -- see the
# comment in validate_token.
MAX_TOKEN_SUBJECT_LENGTH = 256


class TokenPayload(BaseModel):
    sub: str  # Username
    exp: datetime  # Expiration time
    role: str = "user"  # User role, default is regular user
    tenant_id: str | None = None  # Active tenant / workspace identifier
    metadata: dict = {}  # Additional metadata


class ClerkJWKSValidator:
    """Stateless RS256 JWT verifier for Clerk (JWKS or networkless PEM key on Cloud Run)."""

    def __init__(self):
        self.provider = os.getenv("AUTH_PROVIDER", "local").strip().lower()
        self.issuer = os.getenv("CLERK_ISSUER", "").strip().rstrip("/") or None
        self.jwks_url = os.getenv("CLERK_JWKS_URL", "").strip() or (
            f"{self.issuer}/.well-known/jwks.json" if self.issuer else None
        )
        self.jwt_key = os.getenv("CLERK_JWT_KEY", "").strip() or None
        if self.jwt_key and "\\n" in self.jwt_key:
            self.jwt_key = self.jwt_key.replace("\\n", "\n")
        self.audience = os.getenv("CLERK_AUDIENCE", "").strip() or None
        azp_raw = os.getenv("CLERK_AUTHORIZED_PARTIES", "").strip()
        self.authorized_parties = [
            p.strip() for p in azp_raw.split(",") if p.strip()
        ]
        self._jwk_client: PyJWKClient | None = None

    @property
    def enabled(self) -> bool:
        return self.provider == "clerk" or bool(self.jwks_url or self.jwt_key)

    def _get_jwk_client(self) -> PyJWKClient:
        if self._jwk_client is None:
            if not self.jwks_url:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="CLERK_JWKS_URL or CLERK_ISSUER must be configured for Clerk JWT verification.",
                )
            self._jwk_client = PyJWKClient(self.jwks_url, cache_keys=True, lifespan=3600)
        return self._jwk_client

    def verify(self, token: str) -> dict:
        """Verify a Clerk session JWT and normalize claims into LightRAG token_info."""
        try:
            key = self.jwt_key
            if not key:
                signing_key = self._get_jwk_client().get_signing_key_from_jwt(token)
                key = signing_key.key

            decode_kwargs: dict = {
                "algorithms": ["RS256"],
                "options": {"verify_aud": bool(self.audience)},
            }
            if self.audience:
                decode_kwargs["audience"] = self.audience
            if self.issuer:
                decode_kwargs["issuer"] = self.issuer

            payload = jwt.decode(token, key, **decode_kwargs)
        except jwt.PyJWTError as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid Clerk token",
            ) from exc

        if self.authorized_parties:
            azp = payload.get("azp")
            if azp and azp not in self.authorized_parties:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Unauthorized token party",
                )

        sub = payload.get("sub")
        if not isinstance(sub, str) or not sub or len(sub) > MAX_TOKEN_SUBJECT_LENGTH:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token subject",
            )

        exp_ts = payload.get("exp")
        if exp_ts is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token expiration",
            )
        expire_time = datetime.fromtimestamp(exp_ts, timezone.utc)

        # Clerk Organizations: org_id is the shared multi-user tenant/workspace key.
        # Falls back to explicit tenant_id claim or user-scoped workspace.
        org_id = payload.get("org_id")
        tenant_id = (
            org_id
            or payload.get("tenant_id")
            or f"user_{sub}"
        )
        role = payload.get("org_role") or payload.get("role") or "user"
        return {
            "username": sub,
            "role": role,
            "tenant_id": str(tenant_id),
            "metadata": {
                "auth_provider": "clerk",
                "org_id": org_id,
                "org_slug": payload.get("org_slug"),
                "org_permissions": payload.get("org_permissions") or [],
            },
            "exp": expire_time,
        }


class AuthHandler:
    def __init__(self):
        auth_accounts = global_args.auth_accounts
        self.secret = global_args.token_secret
        if not self.secret:
            if auth_accounts:
                raise ValueError(
                    "TOKEN_SECRET must be explicitly set to a non-default value when AUTH_ACCOUNTS is configured."
                )
            self.secret = DEFAULT_TOKEN_SECRET
            logger.warning(
                "TOKEN_SECRET not set and AUTH_ACCOUNTS is not configured. "
                "Falling back to the default guest-mode JWT secret. "
            )
        algorithm = global_args.jwt_algorithm
        if not algorithm or algorithm.lower() == "none":
            raise ValueError(
                "JWT_ALGORITHM must be set to a secure algorithm (e.g. HS256). "
                "The 'none' algorithm is not permitted."
            )
        self.algorithm = algorithm
        self.expire_hours = global_args.token_expire_hours
        self.guest_expire_hours = global_args.guest_token_expire_hours
        self.clerk_validator = ClerkJWKSValidator()
        self.accounts = {}
        invalid_accounts = []
        oversized_username_lengths = []
        if auth_accounts:
            for account in auth_accounts.split(","):
                try:
                    username, password = account.split(":", 1)
                    # Whitespace around the username is list padding; the
                    # password is the credential and is kept byte-for-byte.
                    username = username.strip()
                    if not username or not password:
                        raise ValueError
                except ValueError:
                    invalid_accounts.append(account)
                    continue
                if len(username) > MAX_TOKEN_SUBJECT_LENGTH:
                    # Rejected at configuration time, not at login. create_token
                    # signs the username into the "sub" claim and validate_token
                    # caps that claim at the same bound, so accepting the account
                    # here would let it authenticate at /login and then fail every
                    # subsequent request with 401 -- an unusable account and a
                    # baffling symptom. Both ends of the claim share one constant.
                    oversized_username_lengths.append(len(username))
                    continue
                self.accounts[username] = password
        if invalid_accounts:
            invalid_entries = ", ".join(invalid_accounts)
            logger.error(f"Invalid account format in AUTH_ACCOUNTS: {invalid_entries}")
            raise ValueError(
                "AUTH_ACCOUNTS must use comma-separated user:password pairs."
            )
        if oversized_username_lengths:
            # Only the lengths are logged: the offending entry carries a password.
            logger.error(
                f"AUTH_ACCOUNTS contains {len(oversized_username_lengths)} username(s) "
                f"longer than {MAX_TOKEN_SUBJECT_LENGTH} characters "
                f"(lengths: {oversized_username_lengths})"
            )
            raise ValueError(
                "AUTH_ACCOUNTS usernames must be at most "
                f"{MAX_TOKEN_SUBJECT_LENGTH} characters."
            )

    def verify_password(self, username: str, plain_password: str) -> bool:
        """
        Verify password for a user. Supports explicit bcrypt values and plaintext.

        Args:
            username: Username to verify
            plain_password: Plaintext password to check

        Returns:
            bool: True if password is correct, False otherwise
        """
        # Every branch performs exactly one bcrypt verification so response time
        # cannot be used to enumerate usernames or distinguish plaintext from
        # bcrypt accounts (CWE-208). See _DUMMY_VERIFY_SPEC.
        stored_password = self.accounts.get(username)

        if stored_password is None:
            # Unknown username: run the dummy bcrypt, then fail.
            verify_password(plain_password, _DUMMY_VERIFY_SPEC)
            return False

        if not stored_password.startswith(BCRYPT_PASSWORD_PREFIX):
            # Known plaintext account: the constant-time plaintext compare is
            # only microseconds, so add one dummy bcrypt to match the cost of an
            # unknown username and a {bcrypt} account. Keep the real result.
            password_matches = verify_password(plain_password, stored_password)
            verify_password(plain_password, _DUMMY_VERIFY_SPEC)
            return password_matches

        # Known {bcrypt} account: the real verification already costs one bcrypt.
        return verify_password(plain_password, stored_password)

    def create_token(
        self,
        username: str,
        role: str = "user",
        custom_expire_hours: int = None,
        metadata: dict = None,
        tenant_id: str | None = None,
    ) -> str:
        """
        Create JWT token

        Args:
            username: Username
            role: User role, default is "user", guest is "guest"
            custom_expire_hours: Custom expiration time (hours), if None use default value
            metadata: Additional metadata
            tenant_id: Optional tenant / workspace identifier

        Returns:
            str: Encoded JWT token
        """
        # Choose default expiration time based on role
        if custom_expire_hours is None:
            if role == "guest":
                expire_hours = self.guest_expire_hours
            else:
                expire_hours = self.expire_hours
        else:
            expire_hours = custom_expire_hours

        expire = datetime.now(timezone.utc) + timedelta(hours=expire_hours)

        # Create payload
        payload = TokenPayload(
            sub=username,
            exp=expire,
            role=role,
            tenant_id=tenant_id,
            metadata=metadata or {},
        )

        return jwt.encode(payload.model_dump(), self.secret, algorithm=self.algorithm)

    def is_clerk_enabled(self) -> bool:
        """Return True when external Clerk JWKS/PEM verification is configured."""
        return self.clerk_validator.enabled

    def validate_token(self, token: str) -> dict:
        """
        Validate JWT token (local HS256 or Clerk RS256 JWKS when configured)

        Args:
            token: JWT token

        Returns:
            dict: Dictionary containing user information and tenant_id

        Raises:
            HTTPException: If token is invalid or expired
        """
        if self.clerk_validator.enabled:
            try:
                header = jwt.get_unverified_header(token)
            except jwt.PyJWTError:
                header = {}
            alg = str(header.get("alg", "")).upper()
            if alg != self.algorithm.upper() or self.clerk_validator.provider == "clerk":
                if alg == "HS256" and self.accounts and self.clerk_validator.provider != "clerk":
                    pass
                else:
                    return self.clerk_validator.verify(token)

        try:
            # Explicitly exclude 'none' to prevent algorithm confusion attacks
            allowed_algorithms = [self.algorithm]
            if "none" in (a.lower() for a in allowed_algorithms):
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Insecure JWT algorithm configuration",
                )
            payload = jwt.decode(token, self.secret, algorithms=allowed_algorithms)

            # Claim validation. In any profile that runs on DEFAULT_TOKEN_SECRET
            # (no AUTH_ACCOUNTS, see __init__) the whole payload is attacker-
            # forgeable, so every claim read below is untrusted input. This method
            # is the single choke point all authenticated paths pass through, so
            # bounding the claims here lets callers treat "username" as a short,
            # well-typed string. A malformed claim is an invalid token, not a
            # server error: the previous bare payload["sub"] / payload["exp"]
            # raised KeyError, which jwt.PyJWTError does not cover, so a
            # signature-valid token missing either claim surfaced as HTTP 500.
            username = payload.get("sub")
            if not isinstance(username, str) or not username:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token"
                )
            if len(username) > MAX_TOKEN_SUBJECT_LENGTH:
                # Bounds every downstream use of the claim at once: the renewal
                # cache key, the renewal log line, and the cost of re-signing it.
                # Without this an attacker mints a ~100 KB "sub" per request
                # (CWE-770 / CWE-117, GHSA-3wg5-5w54-3rfm).
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token"
                )

            expire_timestamp = payload.get("exp")
            if expire_timestamp is None:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token"
                )
            try:
                # jwt.decode already rejects a non-numeric "exp", but a numeric
                # one far outside the datetime range reaches here intact.
                expire_time = datetime.fromtimestamp(expire_timestamp, timezone.utc)
            except (OverflowError, OSError, ValueError):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token"
                )

            if datetime.now(timezone.utc) > expire_time:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired"
                )

            # Return complete payload instead of just username
            return {
                "username": username,
                "role": payload.get("role", "user"),
                "tenant_id": payload.get("tenant_id"),
                "metadata": payload.get("metadata", {}),
                "exp": expire_time,
            }
        except jwt.PyJWTError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token"
            )


auth_handler = AuthHandler()
