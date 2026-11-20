"""Offline unit tests for P0-GC-2 URL extraction, lazy-load scroll, and env hash config."""

from __future__ import annotations

import hashlib
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from lightrag.url_extractor import (
    PaywallOrAuthError,
    RedirectLimitError,
    UnsupportedUrlFileError,
    _scroll_full_page,
    extract_url_content,
    fetch_url_target,
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


@pytest.mark.asyncio
async def test_fetch_url_target_downloads_supported_file_and_rejects_unsupported():
    # Unsupported file extension should be rejected before downloading
    with pytest.raises(UnsupportedUrlFileError):
        await fetch_url_target(
            "https://example.com/malware.exe",
            is_supported_file_fn=lambda name: name.endswith((".pdf", ".txt")),
        )

    # Supported file extension should download bytes and return kind="file"
    mock_head_resp = MagicMock(
        status_code=200,
        headers={"content-type": "application/pdf"},
        url="https://example.com/report.pdf",
    )
    mock_get_resp = MagicMock(
        status_code=200,
        content=b"%PDF-1.4 fake pdf",
    )

    mock_client = AsyncMock()
    mock_client.head = AsyncMock(return_value=mock_head_resp)
    mock_client.get = AsyncMock(return_value=mock_get_resp)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    with patch("lightrag.url_extractor.httpx.AsyncClient", return_value=mock_client):
        result = await fetch_url_target(
            "https://example.com/report.pdf",
            is_supported_file_fn=lambda name: name.endswith((".pdf", ".txt")),
        )

    assert result.kind == "file"
    assert result.filename == "report.pdf"
    assert result.content_bytes == b"%PDF-1.4 fake pdf"


def test_document_routes_insert_url_and_tenant_id(tmp_path, monkeypatch):
    import sys

    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    monkeypatch.setattr(sys, "argv", ["lightrag-server"])

    from lightrag.api.routers.document_routes import (
        DocStatusResponse,
        DocumentManager,
        create_document_routes,
    )
    from lightrag.url_extractor import UrlFetchResult

    rag = MagicMock()
    rag.workspace = "space1"
    rag.doc_status = AsyncMock()
    rag.doc_status.get_by_id = AsyncMock(return_value=None)
    rag.doc_status.get_doc_by_file_path = AsyncMock(return_value=None)
    rag.chunk_entity_relation_graph = AsyncMock()
    rag.full_docs = AsyncMock()
    rag.text_chunks = AsyncMock()

    doc_manager = DocumentManager(str(tmp_path))
    app = FastAPI()
    app.state.background_tasks = set()
    router = create_document_routes(rag, doc_manager, api_key=None)
    app.include_router(router)
    client = TestClient(app)

    # 1. Route is registered in OpenAPI
    openapi_paths = client.get("/openapi.json").json()["paths"]
    assert "/documents/insert/url" in openapi_paths

    # 2. Unsupported file URL returns 422
    with (
        patch(
            "lightrag.api.routers.document_routes._reserve_enqueue_slot",
            new=AsyncMock(),
        ),
        patch(
            "lightrag.api.routers.document_routes._release_enqueue_slot",
            new=AsyncMock(),
        ),
        patch(
            "lightrag.url_extractor.fetch_url_target",
            new=AsyncMock(side_effect=UnsupportedUrlFileError("Unsupported .exe")),
        ),
    ):
        bad_resp = client.post(
            "/documents/insert/url", json={"url": "https://example.com/bad.exe"}
        )
    assert bad_resp.status_code == 422

    # 3. Webpage URL crawl returns 200 with track_id
    async def _fake_start_task(managed_tasks, *, work, backstop_release):
        import asyncio

        started = asyncio.Event()
        await work(started)

    with (
        patch(
            "lightrag.api.routers.document_routes.get_existing_doc_by_file_path_candidates",
            new=AsyncMock(return_value=None),
        ),
        patch(
            "lightrag.api.routers.document_routes._reserve_enqueue_slot",
            new=AsyncMock(),
        ),
        patch(
            "lightrag.api.routers.document_routes._release_enqueue_slot",
            new=AsyncMock(),
        ),
        patch(
            "lightrag.api.routers.document_routes.pipeline_index_texts",
            new=AsyncMock(),
        ),
        patch(
            "lightrag.kg.shared_storage.start_reserved_background_task",
            new=_fake_start_task,
        ),
        patch(
            "lightrag.url_extractor.fetch_url_target",
            new=AsyncMock(return_value=UrlFetchResult(kind="text", text="Article body")),
        ),
    ):
        ok_resp = client.post(
            "/documents/insert/url", json={"url": "https://example.com/post"}
        )
    assert ok_resp.status_code == 200
    assert ok_resp.json()["status"] == "success"
    assert ok_resp.json()["track_id"].startswith("insert_")

    # 4. Supported file URL download saves to input_dir and returns 200 with upload track_id
    with (
        patch(
            "lightrag.api.routers.document_routes.get_existing_doc_by_file_path_candidates",
            new=AsyncMock(return_value=None),
        ),
        patch(
            "lightrag.api.routers.document_routes._reserve_enqueue_slot",
            new=AsyncMock(),
        ),
        patch(
            "lightrag.api.routers.document_routes._release_enqueue_slot",
            new=AsyncMock(),
        ),
        patch(
            "lightrag.api.routers.document_routes.pipeline_index_file",
            new=AsyncMock(),
        ),
        patch(
            "lightrag.kg.shared_storage.start_reserved_background_task",
            new=_fake_start_task,
        ),
        patch(
            "lightrag.url_extractor.fetch_url_target",
            new=AsyncMock(
                return_value=UrlFetchResult(
                    kind="file",
                    filename="resume.pdf",
                    content_bytes=b"%PDF-1.4 sample",
                )
            ),
        ),
    ):
        file_resp = client.post(
            "/documents/insert/url", json={"url": "https://example.com/resume.pdf"}
        )
    assert file_resp.status_code == 200
    assert file_resp.json()["status"] == "success"
    assert file_resp.json()["track_id"].startswith("upload_")
    assert (tmp_path / "resume.pdf").read_bytes() == b"%PDF-1.4 sample"

    # 5. DocStatusResponse exposes tenant_id
    doc_resp = DocStatusResponse(
        id="doc-1",
        content_summary="summary",
        content_length=10,
        status="processed",
        created_at="2026-11-20T00:00:00Z",
        updated_at="2026-11-20T00:00:00Z",
        file_path="resume.pdf",
        tenant_id="space1",
    )
    assert doc_resp.tenant_id == "space1"
