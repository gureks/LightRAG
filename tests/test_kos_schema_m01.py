"""Offline unit tests for P0-GC-1 GraphCore schema extensions and dynamic tenant_id."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from lightrag.operate import _merge_edges_then_upsert, _merge_nodes_then_upsert
from lightrag.utils import GRAPH_FIELD_SEP, resolve_tenant_id, tenant_id_ctx

pytestmark = pytest.mark.offline


def test_resolve_tenant_id_priority_and_oauth_context(monkeypatch):
    monkeypatch.setenv("WORKSPACE", "space1")
    assert resolve_tenant_id({}) == "space1"
    assert resolve_tenant_id({"workspace": "team-alpha"}) == "team-alpha"
    assert (
        resolve_tenant_id({"workspace": "team-alpha", "tenant_id": "org-99"})
        == "org-99"
    )

    token = tenant_id_ctx.set("oauth-tenant-42")
    try:
        assert (
            resolve_tenant_id({"workspace": "team-alpha", "tenant_id": "org-99"})
            == "oauth-tenant-42"
        )
    finally:
        tenant_id_ctx.reset(token)


@pytest.mark.asyncio
async def test_merge_nodes_and_edges_attach_temporal_and_tenant_fields(monkeypatch):
    monkeypatch.setenv("WORKSPACE", "space1")

    kg = AsyncMock()
    kg.get_node.return_value = None
    kg.get_edge.return_value = None

    global_config = {
        "workspace": "acme-workspace",
        "llm_model_func": AsyncMock(return_value="summary"),
        "entity_summary_to_max_tokens": 500,
        "summary_context_size": 2000,
        "summary_max_tokens": 500,
        "summary_length_recommended": 200,
        "force_llm_summary_on_merge": 10,
        "max_source_ids_per_entity": 10,
        "max_source_ids_per_relation": 10,
        "source_ids_limit_method": "FIFO",
        "max_file_paths": 10,
        "addon_params": {"language": "English"},
    }

    await _merge_nodes_then_upsert(
        "Alice",
        [
            {
                "entity_name": "Alice",
                "entity_type": "PERSON",
                "description": "Engineer",
                "source_id": "chunk-1",
                "file_path": f"doc-1.pdf{GRAPH_FIELD_SEP}doc-2.pdf",
            }
        ],
        kg,
        entity_vdb=None,
        global_config=global_config,
    )

    kg.upsert_node.assert_awaited_once()
    _, node_kwargs = kg.upsert_node.call_args
    assert node_kwargs["node_data"]["tenant_id"] == "acme-workspace"

    kg.upsert_node.reset_mock()

    await _merge_edges_then_upsert(
        "Alice",
        "Bob",
        [
            {
                "src_id": "Alice",
                "tgt_id": "Bob",
                "weight": 1.0,
                "description": "Works with",
                "keywords": "collaboration",
                "source_id": "chunk-1",
                "file_path": f"doc-1.pdf{GRAPH_FIELD_SEP}doc-2.pdf",
            }
        ],
        kg,
        relationships_vdb=None,
        entity_vdb=None,
        global_config=global_config,
    )

    # Stub nodes created for missing endpoints also get tenant_id
    assert kg.upsert_node.await_count == 2
    for call in kg.upsert_node.call_args_list:
        assert call.kwargs["node_data"]["tenant_id"] == "acme-workspace"

    kg.upsert_edge.assert_awaited_once()
    edge_data = kg.upsert_edge.call_args.kwargs["edge_data"]
    assert edge_data["tenant_id"] == "acme-workspace"
    assert isinstance(edge_data["valid_from"], int)
    assert edge_data["valid_to"] is None
    assert edge_data["source_doc_id"] == "doc-1.pdf"
    assert edge_data["author"] == ""
    assert edge_data["confidence"] == 1.0
