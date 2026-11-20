"""Offline unit & integration tests for P1-MT-1 Multi-Tenant Isolation & Auth."""

from __future__ import annotations

import sys
import types
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import FastAPI
from fastapi.testclient import TestClient

pytestmark = pytest.mark.offline


def _generate_rsa_keypair():
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_pem = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode("utf-8")
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.TraditionalOpenSSL,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("utf-8")
    return private_pem, public_pem


def test_local_jwt_carries_tenant_id(monkeypatch):
    monkeypatch.setattr(sys, "argv", ["lightrag-server"])
    from lightrag.api.auth import AuthHandler

    handler = AuthHandler()
    token = handler.create_token(
        username="alice",
        role="user",
        tenant_id="org_acme",
        metadata={"auth_mode": "enabled"},
    )
    info = handler.validate_token(token)
    assert info["username"] == "alice"
    assert info["tenant_id"] == "org_acme"
    assert info["role"] == "user"


def test_clerk_jwt_verification_extracts_org_id_as_tenant(monkeypatch):
    monkeypatch.setattr(sys, "argv", ["lightrag-server"])
    private_pem, public_pem = _generate_rsa_keypair()

    monkeypatch.setenv("AUTH_PROVIDER", "clerk")
    monkeypatch.setenv("CLERK_JWT_KEY", public_pem)
    monkeypatch.setenv("CLERK_ISSUER", "https://clerk.uncode.local")

    from lightrag.api.auth import ClerkJWKSValidator

    validator = ClerkJWKSValidator()
    assert validator.enabled is True

    now = datetime.now(timezone.utc)
    clerk_token = jwt.encode(
        {
            "sub": "user_2abc",
            "org_id": "org_2shared_ws",
            "org_slug": "acme-eng",
            "org_role": "org:admin",
            "iss": "https://clerk.uncode.local",
            "exp": now + timedelta(hours=1),
        },
        private_pem,
        algorithm="RS256",
    )

    info = validator.verify(clerk_token)
    assert info["username"] == "user_2abc"
    assert info["tenant_id"] == "org_2shared_ws"
    assert info["role"] == "org:admin"
    assert info["metadata"]["auth_provider"] == "clerk"
    assert info["metadata"]["org_slug"] == "acme-eng"


def test_cross_tenant_workspace_header_rejected_with_403(monkeypatch):
    monkeypatch.setattr(sys, "argv", ["lightrag-server"])
    from lightrag.api import utils_api
    from lightrag.api.auth import AuthHandler
    from lightrag.utils import tenant_id_ctx

    handler = AuthHandler()
    monkeypatch.setattr(utils_api, "auth_handler", handler)
    monkeypatch.setattr(utils_api, "auth_configured", True)

    app = FastAPI()
    dep = utils_api.get_combined_auth_dependency(api_key=None)

    @app.get("/test-tenant", dependencies=[pytest.importorskip("fastapi").Depends(dep)])
    async def test_route():
        return {"tenant_id": tenant_id_ctx.get()}

    client = TestClient(app)
    token = handler.create_token(username="bob", role="user", tenant_id="tenant_a")

    # Same tenant succeeds
    ok_resp = client.get(
        "/test-tenant",
        headers={
            "Authorization": f"Bearer {token}",
            "LIGHTRAG-WORKSPACE": "tenant_a",
        },
    )
    assert ok_resp.status_code == 200
    assert ok_resp.json()["tenant_id"] == "tenant_a"

    # Cross-tenant header is rejected with 403
    denied_resp = client.get(
        "/test-tenant",
        headers={
            "Authorization": f"Bearer {token}",
            "LIGHTRAG-WORKSPACE": "tenant_b",
        },
    )
    assert denied_resp.status_code == 403


def _ensure_asyncpg_stub(monkeypatch):
    if "asyncpg" not in sys.modules:
        fake_asyncpg = types.ModuleType("asyncpg")
        fake_asyncpg.Connection = object
        fake_asyncpg.Pool = object
        fake_asyncpg.Record = dict
        fake_asyncpg.exceptions = types.SimpleNamespace(
            UniqueViolationError=Exception,
            DuplicateTableError=Exception,
            DuplicateObjectError=Exception,
            InvalidSchemaNameError=Exception,
            PostgresConnectionError=Exception,
            InterfaceError=Exception,
            TooManyConnectionsError=Exception,
            CannotConnectNowError=Exception,
            ConnectionDoesNotExistError=Exception,
            ConnectionFailureError=Exception,
        )
        monkeypatch.setitem(sys.modules, "asyncpg", fake_asyncpg)
    import pipmaster as pm
    monkeypatch.setattr(pm, "is_installed", lambda pkg: True if pkg == "asyncpg" else False)


@pytest.mark.asyncio
async def test_pgvector_query_uses_active_tenant_ctx_and_sets_rls_config(monkeypatch):
    _ensure_asyncpg_stub(monkeypatch)
    from lightrag.kg.postgres_impl import PostgreSQLDB, PGVectorStorage
    from lightrag.utils import tenant_id_ctx

    # Verify PGVectorStorage._effective_workspace resolves tenant_id_ctx dynamically
    fake_db = MagicMock(spec=PostgreSQLDB)
    fake_db.vector_index_type = "HNSW"
    fake_db.iterative_scan_supported = True
    fake_db.query = AsyncMock(return_value=[])

    storage = PGVectorStorage.__new__(PGVectorStorage)
    storage.workspace = "space1"
    storage.namespace = "chunks"
    storage.table_name = "lightrag_vdb_chunks_test"
    storage.cosine_better_than_threshold = 0.2
    storage.db = fake_db
    storage.embedding_func = AsyncMock(return_value=[[0.1, 0.2, 0.3]])

    tok_a = tenant_id_ctx.set("tenant_alpha")
    try:
        await storage.query("hello", top_k=5, query_embedding=[0.1, 0.2, 0.3])
        assert fake_db.query.call_args.kwargs["params"][0] == "tenant_alpha"
    finally:
        tenant_id_ctx.reset(tok_a)

    tok_b = tenant_id_ctx.set("tenant_beta")
    try:
        await storage.query("hello", top_k=5, query_embedding=[0.1, 0.2, 0.3])
        assert fake_db.query.call_args.kwargs["params"][0] == "tenant_beta"
    finally:
        tenant_id_ctx.reset(tok_b)


@pytest.mark.asyncio
async def test_postgres_db_run_with_retry_sets_transaction_local_rls(monkeypatch):
    _ensure_asyncpg_stub(monkeypatch)
    from lightrag.kg.postgres_impl import PostgreSQLDB
    from lightrag.utils import tenant_id_ctx

    monkeypatch.setenv("POSTGRES_RLS_ENABLED", "true")
    db = PostgreSQLDB(
        {
            "host": "localhost",
            "port": 5432,
            "user": "app_user",
            "password": "secret",
            "database": "postgres",
            "workspace": "space1",
            "max_connections": 2,
            "connection_retry_attempts": 1,
            "connection_retry_backoff": 0,
            "connection_retry_backoff_max": 0,
            "pool_close_timeout": 5.0,
        }
    )

    executed_calls = []

    class _Tx:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

    class _Conn:
        def transaction(self):
            return _Tx()

        async def execute(self, sql, *args):
            executed_calls.append((sql, args))
            return "SET"

    class _Acquire:
        def __init__(self, conn):
            self.conn = conn

        async def __aenter__(self):
            return self.conn

        async def __aexit__(self, exc_type, exc, tb):
            return False

    fake_conn = _Conn()
    fake_pool = MagicMock()
    fake_pool.acquire.return_value = _Acquire(fake_conn)
    db.pool = fake_pool
    db._ensure_pool = AsyncMock()

    async def _op(conn):
        return "ok"

    tok = tenant_id_ctx.set("org_rls_tenant")
    try:
        res = await db._run_with_retry(_op, apply_rls=True)
        assert res == "ok"
        assert executed_calls == [
            ("SELECT set_config('app.current_tenant', $1, true)", ("org_rls_tenant",))
        ]
    finally:
        tenant_id_ctx.reset(tok)


@pytest.mark.asyncio
async def test_networkx_storage_filters_nodes_and_edges_by_tenant(tmp_path):
    from lightrag.kg.networkx_impl import NetworkXStorage
    from lightrag.kg.shared_storage import initialize_share_data
    from lightrag.utils import tenant_id_ctx

    initialize_share_data()
    storage = NetworkXStorage(
        namespace="chunk_entity_relation",
        global_config={"working_dir": str(tmp_path), "embedding_batch_num": 10},
        embedding_func=AsyncMock(),
        workspace="space1",
    )
    await storage.initialize()
    await storage.upsert_node("EntityA", {"entity_id": "EntityA", "tenant_id": "tenant_a"})
    await storage.upsert_node("EntityB", {"entity_id": "EntityB", "tenant_id": "tenant_b"})
    await storage.upsert_edge(
        "EntityA", "EntityB", {"weight": 1.0, "tenant_id": "tenant_b"}
    )

    tok_a = tenant_id_ctx.set("tenant_a")
    try:
        assert await storage.get_node("EntityA") is not None
        assert await storage.get_node("EntityB") is None
        assert await storage.get_edge("EntityA", "EntityB") is None
        all_nodes = await storage.get_all_nodes()
        assert [n["id"] for n in all_nodes] == ["EntityA"]
    finally:
        tenant_id_ctx.reset(tok_a)
