"""Modular URL crawler & extractor with JS rendering, lazy-load scrolling, and file download."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
import os
import re
from typing import Any, Callable, Literal
from urllib.parse import unquote, urlparse

import httpx

from lightrag.utils import logger


class UrlExtractionError(Exception):
    """Base error for URL crawling and extraction."""


class PaywallOrAuthError(UrlExtractionError):
    """Raised when a target URL returns 401/402/403."""


class RedirectLimitError(UrlExtractionError):
    """Raised when a URL exceeds the allowed redirect hop limit."""


class UnsupportedUrlFileError(UrlExtractionError):
    """Raised when a file URL has an unsupported file extension."""


@dataclass(slots=True)
class UrlFetchResult:
    """Result of fetching a URL: either extracted webpage text or a downloaded file."""

    kind: Literal["text", "file"]
    text: str | None = None
    filename: str | None = None
    content_bytes: bytes | None = None


_HTML_MIME_TYPES = ("text/html", "application/xhtml+xml")

_CONTENT_TYPE_EXT_MAP = {
    "application/pdf": ".pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "text/plain": ".txt",
    "text/markdown": ".md",
    "text/csv": ".csv",
    "application/json": ".json",
}


def _extract_filename_from_url_and_headers(
    url: str,
    headers: httpx.Headers | dict[str, str] | None = None,
) -> str:
    """Derive a sanitized filename from Content-Disposition or URL path."""
    filename = ""
    if headers:
        cd = headers.get("content-disposition", "") or headers.get(
            "Content-Disposition", ""
        )
        match = re.search(r'filename\*?=(?:UTF-8\'\')?"?([^";\r\n]+)"?', cd)
        if match:
            filename = os.path.basename(unquote(match.group(1).strip()))

    if not filename:
        parsed_path = unquote(urlparse(url).path or "")
        filename = os.path.basename(parsed_path.rstrip("/"))

    if not filename:
        filename = "downloaded_document"

    # Strip path traversal / unsafe characters while preserving extension
    filename = re.sub(r"[^A-Za-z0-9._-]", "_", filename)
    if "." not in filename and headers:
        ct = (
            (headers.get("content-type", "") or headers.get("Content-Type", ""))
            .split(";")[0]
            .strip()
            .lower()
        )
        ext = _CONTENT_TYPE_EXT_MAP.get(ct, "")
        if ext:
            filename += ext
    return filename


def _looks_like_file_target(
    url: str,
    content_type: str = "",
    content_disposition: str = "",
) -> bool:
    """Return True if the URL/headers point to a downloadable file rather than an HTML page."""
    ct_base = content_type.split(";")[0].strip().lower()
    if "attachment" in content_disposition.lower():
        return True
    if ct_base and not any(ct_base.startswith(h) for h in _HTML_MIME_TYPES):
        return True
    path_lower = urlparse(url).path.lower()
    _, ext = os.path.splitext(path_lower)
    if ext and ext not in (".html", ".htm", ".xhtml", ".php", ".asp", ".aspx", ".jsp"):
        return True
    return False


async def _scroll_full_page(
    page: Any,
    *,
    max_scrolls: int = 30,
    scroll_pause_ms: int = 400,
) -> None:
    """Incrementally scroll to the bottom so lazy-loaded JS content renders."""
    last_height = await page.evaluate("() => document.body.scrollHeight")
    for _ in range(max_scrolls):
        await page.evaluate("() => window.scrollBy(0, window.innerHeight)")
        await asyncio.sleep(scroll_pause_ms / 1000.0)
        new_height = await page.evaluate("() => document.body.scrollHeight")
        scroll_y = await page.evaluate(
            "() => window.scrollY + window.innerHeight"
        )
        if scroll_y >= new_height and new_height == last_height:
            break
        last_height = new_height


async def _fetch_html_playwright(
    url: str,
    *,
    max_redirects: int = 5,
    timeout: float = 30.0,
) -> str:
    """Render URL in headless Chromium, wait for JS, and scroll for lazy load."""
    from playwright.async_api import async_playwright

    redirect_count = 0

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        try:
            context = await browser.new_context()
            page = await context.new_page()

            def _on_response(resp: Any) -> None:
                nonlocal redirect_count
                if 300 <= resp.status < 400:
                    redirect_count += 1

            page.on("response", _on_response)
            response = await page.goto(
                url, wait_until="networkidle", timeout=int(timeout * 1000)
            )
            if redirect_count > max_redirects:
                raise RedirectLimitError(
                    f"URL exceeded {max_redirects} redirects: {url}"
                )
            if response is not None and response.status in (401, 402, 403):
                logger.warning(
                    "Skipping paywalled/restricted URL (status=%s): %s",
                    response.status,
                    url,
                )
                raise PaywallOrAuthError(
                    f"Access denied / paywalled (HTTP {response.status}): {url}"
                )
            if response is not None and response.status >= 400:
                raise UrlExtractionError(
                    f"Failed to fetch URL (HTTP {response.status}): {url}"
                )

            await _scroll_full_page(page)
            try:
                await page.wait_for_load_state("networkidle", timeout=5000)
            except Exception:
                # Best-effort settle after scrolling; page content is still usable.
                pass
            return await page.content()
        finally:
            await browser.close()


async def _fetch_html_httpx(
    url: str,
    *,
    max_redirects: int = 5,
    timeout: float = 20.0,
) -> str:
    """Fetch static HTML via httpx with redirect cap and paywall detection."""
    try:
        async with httpx.AsyncClient(
            follow_redirects=True,
            max_redirects=max_redirects,
            timeout=timeout,
        ) as client:
            resp = await client.get(url)
    except httpx.TooManyRedirects as exc:
        raise RedirectLimitError(
            f"URL exceeded {max_redirects} redirects: {url}"
        ) from exc
    except httpx.HTTPError as exc:
        raise UrlExtractionError(f"HTTP fetch failed for {url}: {exc}") from exc

    if resp.status_code in (401, 402, 403):
        logger.warning(
            "Skipping paywalled/restricted URL (status=%s): %s",
            resp.status_code,
            url,
        )
        raise PaywallOrAuthError(
            f"Access denied / paywalled (HTTP {resp.status_code}): {url}"
        )
    if resp.status_code >= 400:
        raise UrlExtractionError(
            f"Failed to fetch URL (HTTP {resp.status_code}): {url}"
        )
    return resp.text


async def extract_url_content(
    url: str,
    *,
    max_redirects: int = 5,
    timeout: float = 30.0,
) -> str:
    """Fetch a web page (JS-rendered + lazy-load scrolled) and extract clean text."""
    import trafilatura

    html: str | None = None
    try:
        html = await _fetch_html_playwright(
            url, max_redirects=max_redirects, timeout=timeout
        )
    except (PaywallOrAuthError, RedirectLimitError, UrlExtractionError):
        raise
    except Exception as exc:
        logger.debug(
            "Playwright unavailable or failed for %s (%s); falling back to httpx",
            url,
            exc,
        )
        html = await _fetch_html_httpx(
            url, max_redirects=max_redirects, timeout=timeout
        )

    extracted = trafilatura.extract(
        html,
        include_comments=False,
        include_tables=True,
        favor_recall=True,
    )
    if not extracted or not extracted.strip():
        raise UrlExtractionError(f"No ingestible article text extracted from {url}")
    return extracted.strip()


async def fetch_url_target(
    url: str,
    *,
    is_supported_file_fn: Callable[[str], bool],
    max_redirects: int = 5,
    timeout: float = 30.0,
    max_bytes: int | None = None,
) -> UrlFetchResult:
    """Either download a supported file URL or crawl an HTML page."""
    probe_headers: dict[str, str] = {}
    final_url = url
    try:
        async with httpx.AsyncClient(
            follow_redirects=True,
            max_redirects=max_redirects,
            timeout=min(timeout, 15.0),
        ) as client:
            head_resp = await client.head(url)
            if head_resp.status_code in (401, 402, 403):
                logger.warning(
                    "Skipping paywalled/restricted URL (status=%s): %s",
                    head_resp.status_code,
                    url,
                )
                raise PaywallOrAuthError(
                    f"Access denied / paywalled (HTTP {head_resp.status_code}): {url}"
                )
            if head_resp.status_code < 400:
                probe_headers = dict(head_resp.headers)
                final_url = str(head_resp.url)
    except httpx.TooManyRedirects as exc:
        raise RedirectLimitError(
            f"URL exceeded {max_redirects} redirects: {url}"
        ) from exc
    except (PaywallOrAuthError, RedirectLimitError):
        raise
    except httpx.HTTPError:
        # Some servers reject HEAD; fall back to URL extension inspection / HTML crawl.
        pass

    content_type = probe_headers.get("content-type", "")
    content_disposition = probe_headers.get("content-disposition", "")

    if _looks_like_file_target(final_url, content_type, content_disposition):
        filename = _extract_filename_from_url_and_headers(final_url, probe_headers)
        if not is_supported_file_fn(filename):
            raise UnsupportedUrlFileError(
                f"Unsupported file format from URL '{filename}'. "
                "Only supported document formats can be downloaded."
            )

        try:
            async with httpx.AsyncClient(
                follow_redirects=True,
                max_redirects=max_redirects,
                timeout=timeout,
            ) as client:
                resp = await client.get(final_url)
        except httpx.TooManyRedirects as exc:
            raise RedirectLimitError(
                f"URL exceeded {max_redirects} redirects: {url}"
            ) from exc
        except httpx.HTTPError as exc:
            raise UrlExtractionError(f"Failed to download file from {url}: {exc}") from exc

        if resp.status_code in (401, 402, 403):
            raise PaywallOrAuthError(
                f"Access denied / paywalled (HTTP {resp.status_code}): {url}"
            )
        if resp.status_code >= 400:
            raise UrlExtractionError(
                f"Failed to download file (HTTP {resp.status_code}): {url}"
            )

        content_bytes = resp.content
        if max_bytes and max_bytes > 0 and len(content_bytes) > max_bytes:
            raise UrlExtractionError(
                f"Downloaded file exceeds maximum upload size ({max_bytes} bytes)."
            )

        return UrlFetchResult(
            kind="file",
            filename=filename,
            content_bytes=content_bytes,
        )

    text = await extract_url_content(
        url, max_redirects=max_redirects, timeout=timeout
    )
    return UrlFetchResult(kind="text", text=text)
