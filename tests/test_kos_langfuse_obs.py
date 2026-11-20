"""Offline unit tests for P0-OBS-1 Langfuse tracing helpers."""

from __future__ import annotations

import asyncio
from unittest.mock import MagicMock, patch

import pytest

from lightrag.llm import langfuse_utils

pytestmark = pytest.mark.offline


def test_is_langfuse_enabled_false_when_keys_missing(monkeypatch):
    monkeypatch.delenv("LANGFUSE_PUBLIC_KEY", raising=False)
    monkeypatch.delenv("LANGFUSE_SECRET_KEY", raising=False)
    assert langfuse_utils.is_langfuse_enabled() is False


def test_observe_generation_noop_when_disabled(monkeypatch):
    monkeypatch.delenv("LANGFUSE_PUBLIC_KEY", raising=False)
    monkeypatch.delenv("LANGFUSE_SECRET_KEY", raising=False)

    @langfuse_utils.observe_generation("test_gen")
    async def dummy(x: int) -> int:
        return x + 1

    assert asyncio.run(dummy(41)) == 42


def test_update_generation_calls_client_when_enabled(monkeypatch):
    monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "pk-test")
    monkeypatch.setenv("LANGFUSE_SECRET_KEY", "sk-test")

    mock_client = MagicMock()
    with (
        patch.object(langfuse_utils, "_LANGFUSE_IMPORTABLE", True),
        patch.object(langfuse_utils, "_langfuse_get_client", return_value=mock_client),
    ):
        langfuse_utils.update_generation(
            model="gemini-2.5-flash",
            input_data={"prompt": "hello"},
            output_data="world",
            usage_details={"input": 5, "output": 3, "total": 8},
            metadata={"provider": "gemini"},
        )

    mock_client.update_current_generation.assert_called_once_with(
        model="gemini-2.5-flash",
        input={"prompt": "hello"},
        output="world",
        usage_details={"input": 5, "output": 3, "total": 8},
        metadata={"provider": "gemini"},
    )


@pytest.mark.asyncio
async def test_trace_async_stream_passthrough_when_disabled(monkeypatch):
    monkeypatch.delenv("LANGFUSE_PUBLIC_KEY", raising=False)
    monkeypatch.delenv("LANGFUSE_SECRET_KEY", raising=False)

    async def gen():
        yield "hello "
        yield "uncode"

    chunks = [
        chunk
        async for chunk in langfuse_utils.trace_async_stream(
            gen(),
            name="test_stream",
            model="bedrock-test",
        )
    ]
    assert "".join(chunks) == "hello uncode"
