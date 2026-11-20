"""Offline unit tests for P0-OBS-2 JSON logging and /metrics observability."""

from __future__ import annotations

import json
import logging

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from prometheus_fastapi_instrumentator import Instrumentator

from lightrag.utils import JsonLogFormatter, setup_logger

pytestmark = pytest.mark.offline


def test_json_log_formatter_outputs_valid_json():
    formatter = JsonLogFormatter()
    record = logging.LogRecord(
        name="lightrag",
        level=logging.INFO,
        pathname=__file__,
        lineno=10,
        msg="hello %s",
        args=("uncode",),
        exc_info=None,
    )
    rendered = formatter.format(record)
    parsed = json.loads(rendered)
    assert parsed["level"] == "INFO"
    assert parsed["logger"] == "lightrag"
    assert parsed["message"] == "hello uncode"
    assert "timestamp" in parsed


def test_setup_logger_respects_log_format_json(monkeypatch):
    monkeypatch.setenv("LOG_FORMAT", "json")
    test_logger_name = "lightrag_test_json_obs"
    setup_logger(test_logger_name, level="INFO", enable_file_logging=False)
    test_logger = logging.getLogger(test_logger_name)
    assert len(test_logger.handlers) == 1
    assert isinstance(test_logger.handlers[0].formatter, JsonLogFormatter)


def test_prometheus_instrumentator_exposes_metrics():
    app = FastAPI()

    @app.get("/ping")
    def ping():
        return {"ok": True}

    Instrumentator().instrument(app, metric_namespace="lightrag").expose(
        app, endpoint="/metrics", include_in_schema=False
    )

    client = TestClient(app)
    assert client.get("/ping").status_code == 200
    metrics_resp = client.get("/metrics")
    assert metrics_resp.status_code == 200
    assert "lightrag_http_requests_total" in metrics_resp.text
