"""Shared Langfuse v3 observability helpers for non-OpenAI LLM bindings.

Gracefully degrades to zero-overhead no-ops when ``LANGFUSE_PUBLIC_KEY`` /
``LANGFUSE_SECRET_KEY`` are unset or the ``langfuse`` package is not installed.
"""

from __future__ import annotations

import functools
import os
from collections.abc import AsyncIterator, Callable
from typing import Any, TypeVar

from lightrag.utils import logger

F = TypeVar("F", bound=Callable[..., Any])

try:
    from langfuse import get_client as _langfuse_get_client
    from langfuse import observe as _langfuse_observe

    _LANGFUSE_IMPORTABLE = True
except ImportError:  # pragma: no cover - optional dependency
    _langfuse_get_client = None
    _langfuse_observe = None
    _LANGFUSE_IMPORTABLE = False


def is_langfuse_enabled() -> bool:
    """Return True when Langfuse keys are configured and the SDK is installed."""
    return bool(
        _LANGFUSE_IMPORTABLE
        and os.environ.get("LANGFUSE_PUBLIC_KEY")
        and os.environ.get("LANGFUSE_SECRET_KEY")
    )


def observe_generation(name: str) -> Callable[[F], F]:
    """Decorate an async LLM function as a Langfuse ``generation`` span.

    When Langfuse is not installed or keys are unset at call time, the wrapped
    function executes directly with no tracing overhead.
    """

    def decorator(func: F) -> F:
        if not _LANGFUSE_IMPORTABLE or _langfuse_observe is None:
            return func

        traced_func = _langfuse_observe(as_type="generation", name=name)(func)

        @functools.wraps(func)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            if not is_langfuse_enabled():
                return await func(*args, **kwargs)
            return await traced_func(*args, **kwargs)

        return wrapper  # type: ignore[return-value]

    return decorator


def update_generation(
    *,
    model: str | None = None,
    input_data: Any = None,
    output_data: Any = None,
    usage_details: dict[str, int] | None = None,
    model_parameters: dict[str, Any] | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    """Safely update the active Langfuse generation observation."""
    if not is_langfuse_enabled() or _langfuse_get_client is None:
        return

    payload: dict[str, Any] = {}
    if model is not None:
        payload["model"] = model
    if input_data is not None:
        payload["input"] = input_data
    if output_data is not None:
        payload["output"] = output_data
    if usage_details:
        payload["usage_details"] = {
            k: int(v) for k, v in usage_details.items() if v is not None
        }
    if model_parameters:
        filtered_params = {
            k: v for k, v in model_parameters.items() if v is not None
        }
        if filtered_params:
            payload["model_parameters"] = filtered_params
    if metadata:
        payload["metadata"] = metadata

    if not payload:
        return

    try:
        client = _langfuse_get_client()
        client.update_current_generation(**payload)
    except Exception as exc:  # pragma: no cover - observability must never fail LLM calls
        logger.debug("Langfuse update_current_generation skipped: %s", exc)


async def trace_async_stream(
    stream_iter: AsyncIterator[str],
    *,
    name: str,
    model: str | None = None,
    input_data: Any = None,
    usage_getter: Callable[[], dict[str, int] | None] | None = None,
    metadata: dict[str, Any] | None = None,
) -> AsyncIterator[str]:
    """Yield chunks from ``stream_iter`` while recording output to Langfuse."""
    if not is_langfuse_enabled() or _langfuse_get_client is None:
        async for chunk in stream_iter:
            yield chunk
        return

    chunks: list[str] = []
    client = _langfuse_get_client()
    try:
        with client.start_as_current_observation(
            as_type="generation",
            name=name,
            model=model,
            input=input_data,
            metadata=metadata,
        ) as gen:
            async for chunk in stream_iter:
                chunks.append(chunk)
                yield chunk
            usage = usage_getter() if callable(usage_getter) else None
            update_kwargs: dict[str, Any] = {"output": "".join(chunks)}
            if usage:
                update_kwargs["usage_details"] = {
                    k: int(v) for k, v in usage.items() if v is not None
                }
            gen.update(**update_kwargs)
    except Exception as exc:  # pragma: no cover
        logger.debug("Langfuse streaming trace error: %s", exc)
        # If start_as_current_observation itself failed before yielding, fall through
        if not chunks:
            async for chunk in stream_iter:
                yield chunk
