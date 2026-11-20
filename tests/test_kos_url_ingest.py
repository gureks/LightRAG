"""Offline unit tests for P0-GC-2 URL extraction, lazy-load scroll, and env hash config."""

from __future__ import annotations

import hashlib
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from lightrag.url_extractor import (
    PaywallOrAuthError,
    RedirectLimitError,
    _scroll_full_page,
    extract_url_content,
)
from lightrag.utils import compute_mdhash_id

pytestmark = pytest.mark.offline


def test_compute_mdhash_id_respects_env_hash_algorithm(monkeypatch):
    monkeypatch.delenv("HASH_ALGORITHM", raising=False)
    md5_id = compute_mdhash_id("hello uncode", prefix="doc-")
    assert md5_id == "doc-" + hashlib.md5(b"hello uncode").hexdigest()

    monkeypatch.setenv("HASH_ALGORITHM", "sha256")
    sha_id = compute_mdhash_id("hello uncode", prefix="doc-")
    assert sha_id == "doc-" + hashlib.sha256(b"hello uncode").hexdigest()


@pytest.mark.asyncio
async def test_scroll_full_page_stops_when_height_stabilizes():
    page = MagicMock()
    page.evaluate = AsyncMock(
        side_effect=[
            1000,  # initial height
            None,  # window.scrollBy
            1500,  # new_height after lazy load
            800,   # scroll_y < 1500
            None,  # window.scrollBy
            1500,  # new_height unchanged
            1500,  # scroll_y >= 1500
        ]
    )
    await _scroll_full_page(page, max_scrolls=10, scroll_pause_ms=0)
    assert page.evaluate.await_count == 7


@pytest.mark.asyncio
async def test_extract_url_content_uses_playwright_and_trafilatura():
    sample_html = (
        "<html><body><article><h1>Uncode Graph</h1>"
        "<p>Lazy-loaded knowledge graph content rendered by client JS.</p>"
        "</article></body></html>"
    )
    with patch(
        "lightrag.url_extractor._fetch_html_playwright",
        new=AsyncMock(return_value=sample_html),
    ):
        text = await extract_url_content("https://example.com/article")

    assert "Uncode Graph" in text
    assert "Lazy-loaded knowledge graph content" in text


@pytest.mark.asyncio
async def test_extract_url_content_propagates_paywall_and_redirect_errors():
    with patch(
        "lightrag.url_extractor._fetch_html_playwright",
        new=AsyncMock(side_effect=PaywallOrAuthError("HTTP 403")),
    ):
        with pytest.raises(PaywallOrAuthError):
            await extract_url_content("https://example.com/paywall")

    with patch(
        "lightrag.url_extractor._fetch_html_playwright",
        new=AsyncMock(side_effect=RedirectLimitError("too many redirects")),
    ):
        with pytest.raises(RedirectLimitError):
            await extract_url_content("https://example.com/loop")
