"""Provider-neutral runtime client and explicit LangChain tool contracts."""

import json
from contextlib import suppress
from dataclasses import asdict, dataclass
from hashlib import sha256
from typing import Annotated, Any

import httpx
from langchain_core.callbacks.manager import adispatch_custom_event
from langchain_core.tools import BaseTool, InjectedToolCallId, StructuredTool
from pydantic import BaseModel, ConfigDict, Field

from my_bot_ai.features.agent.errors import (
    RuntimeCallError,
    RuntimeIdempotencyConflictError,
    RuntimeRecoveryRequiredError,
)

RuntimePath = Annotated[str, Field(min_length=1, max_length=4_096)]
Selector = Annotated[str, Field(min_length=1, max_length=4_096)]


@dataclass(frozen=True, slots=True)
class RuntimeContext:
    run_id: str
    conversation_id: str
    user_id: str
    workspace_id: str
    working_directory: str = "/workspace"


class RuntimeClient:
    """Post normalized tool calls to the private runtime service."""

    def __init__(
        self,
        base_url: str,
        *,
        token: str | None = None,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        normalized = base_url.rstrip("/")
        self._endpoint = normalized if normalized.endswith("/tools") else f"{normalized}/tools"
        self._token = token
        self._client = client

    async def execute_tool(
        self,
        name: str,
        arguments: dict[str, Any],
        context: RuntimeContext,
        *,
        operation_id: str,
    ) -> Any:
        """Execute one named tool without leaking runtime response errors."""

        headers = {"authorization": f"Bearer {self._token}"} if self._token else {}
        body = {
            "version": 2,
            **asdict(context),
            "operation_id": operation_id,
            "tool": name,
            "arguments": arguments,
        }
        try:
            if self._client is not None:
                response = await self._client.post(self._endpoint, json=body, headers=headers)
            else:
                async with httpx.AsyncClient(timeout=30) as client:
                    response = await client.post(self._endpoint, json=body, headers=headers)
            if not response.is_success:
                self._raise_runtime_error(response)
            payload = response.json()
            if not isinstance(payload, dict) or "result" not in payload:
                raise RuntimeCallError
            result = payload["result"]
            json.dumps(result)
            if (
                name.startswith("browser.")
                and isinstance(result, dict)
                and "browser_frame" in result
            ):
                result = dict(result)
                frame = result.pop("browser_frame")
                if _valid_browser_frame(frame):
                    with suppress(RuntimeError):
                        await adispatch_custom_event("browser.frame", frame)
            return result
        except RuntimeCallError:
            raise
        except (httpx.HTTPError, TypeError, ValueError) as error:
            raise RuntimeCallError from error

    @staticmethod
    def _raise_runtime_error(response: httpx.Response) -> None:
        try:
            payload = response.json()
            detail = payload.get("error") if isinstance(payload, dict) else None
            code = detail.get("code") if isinstance(detail, dict) else None
        except ValueError:
            code = None
        if code == "manual_recovery_required":
            raise RuntimeRecoveryRequiredError
        if code == "idempotency_conflict":
            raise RuntimeIdempotencyConflictError
        raise RuntimeCallError


def _valid_browser_frame(value: Any) -> bool:
    if not isinstance(value, dict):
        return False
    base64 = value.get("base64")
    mime_type = value.get("mime_type")
    captured_at = value.get("captured_at")
    return (
        isinstance(base64, str)
        and 0 < len(base64) <= 2_000_000
        and mime_type in {"image/png", "image/jpeg"}
        and isinstance(captured_at, str)
        and 0 < len(captured_at) <= 100
    )


class RuntimeToolInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tool_call_id: Annotated[str, InjectedToolCallId]


class FilesystemListInput(RuntimeToolInput):
    path: RuntimePath = "."


class FilesystemReadInput(RuntimeToolInput):
    path: RuntimePath


class FilesystemWriteInput(RuntimeToolInput):
    path: RuntimePath
    content: str = Field(max_length=2_000_000)


class ShellExecInput(RuntimeToolInput):
    command: str = Field(min_length=1, max_length=512)
    argv: list[Annotated[str, Field(min_length=1, max_length=16_384)]] = Field(
        default_factory=list, max_length=128
    )
    cwd: RuntimePath = "."


class BrowserOpenInput(RuntimeToolInput):
    url: str = Field(min_length=1, max_length=8_192)


class EmptyInput(RuntimeToolInput):
    pass


class BrowserClickInput(RuntimeToolInput):
    selector: Selector


class BrowserTypeInput(RuntimeToolInput):
    selector: Selector
    text: str = Field(min_length=1, max_length=100_000)


def build_runtime_tools(client: RuntimeClient, context: RuntimeContext) -> tuple[BaseTool, ...]:
    """Create the complete model-visible runtime tool set for one request."""

    def operation_id(name: str, tool_call_id: str) -> str:
        value = f"{context.run_id}\0{tool_call_id}\0{name}".encode()
        return sha256(value).hexdigest()

    async def filesystem_list(
        path: str = ".",
        tool_call_id: Annotated[str, InjectedToolCallId] = "",
    ) -> Any:
        name = "filesystem.list"
        return await client.execute_tool(
            name, {"path": path}, context, operation_id=operation_id(name, tool_call_id)
        )

    async def filesystem_read(
        path: str, tool_call_id: Annotated[str, InjectedToolCallId]
    ) -> Any:
        name = "filesystem.read"
        return await client.execute_tool(
            name, {"path": path}, context, operation_id=operation_id(name, tool_call_id)
        )

    async def filesystem_write(
        path: str, content: str, tool_call_id: Annotated[str, InjectedToolCallId]
    ) -> Any:
        name = "filesystem.write"
        return await client.execute_tool(
            name,
            {"path": path, "content": content},
            context,
            operation_id=operation_id(name, tool_call_id),
        )

    async def shell_exec(
        command: str,
        argv: list[str],
        cwd: str = ".",
        tool_call_id: Annotated[str, InjectedToolCallId] = "",
    ) -> Any:
        name = "shell.exec"
        return await client.execute_tool(
            name,
            {"command": command, "argv": argv, "cwd": cwd},
            context,
            operation_id=operation_id(name, tool_call_id),
        )

    async def browser_open(
        url: str, tool_call_id: Annotated[str, InjectedToolCallId]
    ) -> Any:
        name = "browser.open"
        return await client.execute_tool(
            name, {"url": url}, context, operation_id=operation_id(name, tool_call_id)
        )

    async def browser_snapshot(tool_call_id: Annotated[str, InjectedToolCallId]) -> Any:
        name = "browser.snapshot"
        return await client.execute_tool(
            name, {}, context, operation_id=operation_id(name, tool_call_id)
        )

    async def browser_click(
        selector: str, tool_call_id: Annotated[str, InjectedToolCallId]
    ) -> Any:
        name = "browser.click"
        return await client.execute_tool(
            name,
            {"selector": selector},
            context,
            operation_id=operation_id(name, tool_call_id),
        )

    async def browser_type(
        selector: str,
        text: str,
        tool_call_id: Annotated[str, InjectedToolCallId],
    ) -> Any:
        name = "browser.type"
        return await client.execute_tool(
            name,
            {"selector": selector, "text": text},
            context,
            operation_id=operation_id(name, tool_call_id),
        )

    async def browser_close(tool_call_id: Annotated[str, InjectedToolCallId]) -> Any:
        name = "browser.close"
        return await client.execute_tool(
            name, {}, context, operation_id=operation_id(name, tool_call_id)
        )

    return (
        StructuredTool.from_function(
            coroutine=filesystem_list,
            name="filesystem_list",
            description=(
                "List files and directories inside the isolated /workspace tree. "
                "Use this to discover workspace contents before reading or changing files."
            ),
            args_schema=FilesystemListInput,
        ),
        StructuredTool.from_function(
            coroutine=filesystem_read,
            name="filesystem_read",
            description="Read one UTF-8 text file inside the isolated /workspace tree.",
            args_schema=FilesystemReadInput,
        ),
        StructuredTool.from_function(
            coroutine=filesystem_write,
            name="filesystem_write",
            description=(
                "Create or replace one UTF-8 text file inside the isolated /workspace tree."
            ),
            args_schema=FilesystemWriteInput,
        ),
        StructuredTool.from_function(
            coroutine=shell_exec,
            name="shell_exec",
            description=(
                "Run one executable in the isolated workspace with an explicit argv list and cwd. "
                "Pass arguments separately; shell syntax is not interpreted."
            ),
            args_schema=ShellExecInput,
        ),
        StructuredTool.from_function(
            coroutine=browser_open,
            name="browser_open",
            description="Open an HTTP(S) page in the isolated workspace browser.",
            args_schema=BrowserOpenInput,
        ),
        StructuredTool.from_function(
            coroutine=browser_snapshot,
            name="browser_snapshot",
            description=(
                "Return the current isolated browser's interactive snapshot for inspection."
            ),
            args_schema=EmptyInput,
        ),
        StructuredTool.from_function(
            coroutine=browser_click,
            name="browser_click",
            description="Click one element from the current isolated browser snapshot.",
            args_schema=BrowserClickInput,
        ),
        StructuredTool.from_function(
            coroutine=browser_type,
            name="browser_type",
            description="Type text into one element in the isolated browser.",
            args_schema=BrowserTypeInput,
        ),
        StructuredTool.from_function(
            coroutine=browser_close,
            name="browser_close",
            description="Close the isolated workspace browser session.",
            args_schema=EmptyInput,
        ),
    )
