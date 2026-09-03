import json
import logging
import re
from types import SimpleNamespace
from unittest.mock import Mock

import structlog
from starlette.requests import Request

from my_bot_ai.logging import (
    _completed,
    classify_error,
    classify_public_error,
    configure_logging,
    lifecycle_event,
    safe_identifier,
)


def test_renderer_matches_environment() -> None:
    configure_logging("production")
    assert isinstance(structlog.get_config()["processors"][-1], structlog.processors.JSONRenderer)
    configure_logging("development")
    assert isinstance(structlog.get_config()["processors"][-1], structlog.dev.ConsoleRenderer)


def test_development_renderer_is_colored_and_human_readable() -> None:
    configure_logging("development")
    renderer = structlog.get_config()["processors"][-1]
    rendered = renderer(
        None,
        "info",
        {
            "timestamp": "2026-09-01 12:34:56",
            "level": "info",
            "event": "request_completed",
            "logger": "my_bot_ai",
            "duration_ms": 12.5,
            "outcome": "success",
        },
    )
    assert "\x1b[" in rendered
    plain = re.sub(r"\x1b\[[0-9;]*m", "", rendered)
    lines = plain.splitlines()
    assert lines[0] == "[2026-09-01 12:34:56] INFO (my_bot_ai): request_completed"
    assert "    duration_ms: 12.5" in lines
    assert '    outcome: "success"' in lines


def test_uvicorn_records_use_the_shared_development_renderer() -> None:
    configure_logging("development")
    handler = next(
        handler
        for handler in logging.getLogger("uvicorn").handlers
        if getattr(handler, "my_bot_ai_handler", False)
    )
    record = logging.LogRecord(
        "uvicorn.error", logging.INFO, __file__, 1, "Uvicorn running", (), None
    )
    rendered = handler.format(record)
    assert "\x1b[" in rendered
    plain = re.sub(r"\x1b\[[0-9;]*m", "", rendered)
    lines = plain.splitlines()
    assert "INFO (uvicorn.error): Uvicorn running" in lines[0]
    assert '    environment: "development"' in lines


def test_uvicorn_production_records_preserve_the_shared_json_schema() -> None:
    configure_logging("production")
    handler = next(
        handler
        for handler in logging.getLogger("uvicorn").handlers
        if getattr(handler, "my_bot_ai_handler", False)
    )
    record = logging.LogRecord(
        "uvicorn.error", logging.INFO, __file__, 1, "Uvicorn running", (), None
    )
    rendered = json.loads(handler.format(record))
    assert rendered["event"] == "Uvicorn running"
    assert rendered["level"] == "info"
    assert rendered["logger"] == "uvicorn.error"
    assert rendered["service"] == "my_bot_ai"
    assert rendered["environment"] == "production"
    assert rendered["schema_version"] == 1
    assert rendered["timestamp"].endswith("Z")


def test_invalid_request_id_is_replaced() -> None:
    value = safe_identifier("bad value with\nsecrets")
    assert value != "bad value with\nsecrets"
    assert len(value) == 36


def test_terminal_event_is_bounded_and_redacted() -> None:
    request = Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/agent/stream",
            "headers": [],
            "query_string": b"",
            "router": SimpleNamespace(path="/agent/stream"),
        }
    )
    request.state.turn_id = "turn-1"
    request.state.conversation_id = "conversation-1"
    request.state.model = "gpt-5.6-sol"
    request.state.reasoning_effort = "medium"
    logger = Mock()

    _completed(logger, request, 200, "success", 0)

    fields = logger.info.call_args.kwargs
    assert fields["event"] == "request_completed"
    assert fields["http_method"] == "post"
    assert fields["http_route"] == "/agent/stream"
    assert fields["outcome"] == "success"
    assert "content" not in json.dumps(fields)
    assert "authorization" not in json.dumps(fields).lower()


def test_emitted_production_record_is_iso_and_recursively_redacted() -> None:
    configure_logging("production")
    records: list[str] = []

    class Capture(logging.Handler):
        def emit(self, record: logging.LogRecord) -> None:
            records.append(record.getMessage())

    service_logger = logging.getLogger("my_bot_ai")
    handler = Capture()
    service_logger.addHandler(handler)
    try:
        lifecycle_event(
            "operational_event",
            nested={"authorization": "secret", "safe": True},
            rows=[{"content": "private", "safe": "value"}],
        )
    finally:
        service_logger.removeHandler(handler)

    record = json.loads(records[-1])
    assert record["level"] == "info"
    assert record["service"] == "my_bot_ai"
    assert record["environment"] == "production"
    assert record["schema_version"] == 1
    assert record["event"] == "operational_event"
    assert record["nested"] == {"safe": True}
    assert record["rows"] == [{"safe": "value"}]
    assert record["timestamp"].endswith("Z")
    assert "secret" not in json.dumps(record)


def test_provider_quota_is_distinct_from_rate_limit() -> None:
    class QuotaError(Exception):
        code = "insufficient_quota"

    class RateLimitError(Exception):
        status_code = 429

    quota = classify_error(QuotaError(), "openai")
    limited = classify_error(RateLimitError(), "openai")
    assert quota == {
        "error_type": "QuotaError",
        "error_category": "provider_quota",
        "error_code": "insufficient_quota",
        "error_summary": "The AI provider quota is exhausted.",
        "retryable": False,
        "provider": "openai",
    }
    assert limited["error_category"] == "provider_rate_limit"
    assert limited["retryable"] is True
    assert limited["provider"] == "openai"


def test_public_error_codes_are_allowlisted() -> None:
    fields = classify_public_error("private-provider-body", "openai", True)

    assert fields["error_code"] == "provider_error"
    assert fields["error_category"] == "provider_failure"
    assert "private-provider-body" not in json.dumps(fields)


def test_completed_merges_safe_cause_without_exception_text() -> None:
    request = Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/agent/stream",
            "headers": [],
            "query_string": b"",
            "router": SimpleNamespace(path="/agent/stream"),
        }
    )
    request.state.provider = "openai"
    request.state.error_cause = classify_error(
        RuntimeError("secret prompt and Authorization: bearer token"), "openai"
    )
    logger = Mock()
    _completed(logger, request, 500, "error", 0)
    fields = logger.info.call_args.kwargs
    assert fields["error_category"] == "internal"
    assert fields["error_summary"] == "The AI service encountered an internal error."
    assert "secret prompt" not in json.dumps(fields)
    assert "Authorization" not in json.dumps(fields)
