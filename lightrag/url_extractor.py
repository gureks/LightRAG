"""Modular URL crawler & extractor with JS rendering and lazy-load scrolling."""

from __future__ import annotations

import asyncio
from typing import Any

import httpx

from lightrag.utils import logger


class UrlExtractionError(Exception):
    """Base error for URL crawling and extraction."""


class PaywallOrAuthError(UrlExtractionError):
    """Raised when a target URL returns 401/402/403."""


class RedirectLimitError(UrlExtractionError):
    """Raised when a URL exceeds the allowed redirect hop limit."""


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
