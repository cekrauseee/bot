"""LangChain-backed model construction and normalized stream events."""

from collections.abc import AsyncIterator
from typing import Any, Literal

from langchain.agents import create_agent
from langchain_openai import ChatOpenAI

from my_bot_ai.config import Settings

ModelName = Literal["gpt-5.6-sol", "gpt-5.6-luna"]
ReasoningEffort = Literal["low", "medium", "high", "xhigh", "max"]


def build_model(
    settings: Settings, model: ModelName, reasoning_effort: ReasoningEffort, speed: str
) -> ChatOpenAI:
    """Build the provider model with the request's explicit Responses settings."""
    if not settings.openai_api_key:
        raise RuntimeError("provider_missing")
    llm = ChatOpenAI(
        model=model,
        api_key=settings.openai_api_key,
        use_responses_api=True,
        store=False,
        reasoning={"effort": reasoning_effort, "summary": "auto"},
        service_tier="fast" if speed == "fast" else "default",
        streaming=True,
    )
    return create_agent(model=llm, tools=[{"type": "web_search"}])


def _content(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return "".join(item.get("text", "") for item in value if isinstance(item, dict))
    return ""


def _reasoning_summary(chunk: Any) -> list[str]:
    summaries: list[str] = []
    for block in getattr(chunk, "content_blocks", []) or []:
        if not isinstance(block, dict) or block.get("type") != "reasoning":
            continue
        for key in ("reasoning", "text"):
            if block.get(key):
                summaries.append(str(block[key]))
        for item in block.get("summary", []) or []:
            text = _content(item.get("text", "") if isinstance(item, dict) else item)
            if text:
                summaries.append(text)
    metadata = getattr(chunk, "response_metadata", {}) or {}
    for item in metadata.get("reasoning_summary", []) or []:
        text = _content(item)
        if text:
            summaries.append(text)
    return summaries


def _blocks(chunk: Any) -> list[dict[str, Any]]:
    blocks = getattr(chunk, "content_blocks", None)
    if blocks is None:
        blocks = getattr(chunk, "content", [])
    return [block for block in blocks or [] if isinstance(block, dict)]


def _sources(value: Any) -> list[dict[str, str]]:
    found: list[dict[str, str]] = []
    if isinstance(value, dict):
        if value.get("url") and (value.get("title") or value.get("id")):
            item = {
                "id": str(value.get("id") or value["url"]),
                "title": str(value.get("title") or value["url"]),
                "url": str(value["url"]),
                "domain": str(
                    value.get("domain") or value["url"].split("//", 1)[-1].split("/", 1)[0]
                ),
            }
            found.append(item)
        for child in value.values():
            found.extend(_sources(child))
    elif isinstance(value, list):
        for child in value:
            found.extend(_sources(child))
    unique: dict[str, dict[str, str]] = {
        item.get("url", str(index)): item for index, item in enumerate(found)
    }
    return list(unique.values())


async def stream_model(llm: Any, messages: list[dict[str, str]]) -> AsyncIterator[dict[str, Any]]:
    """Normalize LangChain v2 events without exposing hidden chain-of-thought."""
    searches: dict[str, dict[str, Any]] = {}
    pending_sources: list[dict[str, str]] = []
    async for event in llm.astream_events({"messages": messages}, version="v2"):
        kind = event.get("event", "")
        data = event.get("data") or {}
        chunk = data.get("chunk")
        if kind == "on_chat_model_stream" and chunk is not None:
            for block in _blocks(chunk):
                if block.get("type") == "text" and block.get("text"):
                    yield {"type": "text.delta", "data": {"delta": str(block["text"])}}
                annotations = block.get("annotations") or []
                if annotations:
                    citations = _sources(annotations)
                    if citations and searches:
                        search_id = next(reversed(searches))
                        searches[search_id]["sources"] = citations
                        yield {"type": "step.updated", "data": {"step": searches[search_id]}}
                    elif citations:
                        pending_sources = citations
            for summary in _reasoning_summary(chunk):
                yield {"type": "reasoning.delta", "data": {"delta": summary}}
            for block in _blocks(chunk):
                if block.get("type") not in {
                    "server_tool_call",
                    "server_tool_call_chunk",
                    "server_tool_result",
                }:
                    continue
                block_id = str(block.get("id") or block.get("tool_call_id") or "")
                if (
                    "web_search" not in str(block.get("name", "")).lower()
                    and block_id not in searches
                    and block["type"] != "server_tool_call"
                    and block["type"] != "server_tool_call_chunk"
                ):
                    continue
                search_id = block_id or "web-search"
                existing = searches.get(search_id)
                step = existing or {
                    "id": search_id,
                    "kind": "web_search",
                    "status": "completed"
                    if block["type"] == "server_tool_result"
                    else "in_progress",
                    "label": "Web search",
                }
                args = block.get("args") or {}
                if args.get("query"):
                    step["query"] = str(args["query"])
                sources = _sources(block.get("output") or block.get("result"))
                if not sources and pending_sources:
                    sources = pending_sources
                    pending_sources = []
                if sources:
                    step["sources"] = sources
                event_type = (
                    "step.completed"
                    if block["type"] == "server_tool_result"
                    else ("step.updated" if existing else "step.started")
                )
                searches[search_id] = step
                yield {"type": event_type, "data": {"step": step}}
        elif kind in {"on_tool_start", "on_tool_end"}:
            name = data.get("name") or event.get("name")
            if name and "web" in name.lower():
                status = "in_progress" if kind == "on_tool_start" else "completed"
                event_type = "step.started" if kind == "on_tool_start" else "step.completed"
                yield {
                    "type": event_type,
                    "data": {
                        "step": {
                            "id": event.get("run_id", "web-search"),
                            "kind": "web_search",
                            "status": status,
                            "label": "Web search",
                        }
                    },
                }
