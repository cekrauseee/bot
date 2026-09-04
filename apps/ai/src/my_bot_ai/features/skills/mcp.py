"""Provider-neutral hosted MCP descriptors for per-run connections."""
from collections.abc import Sequence

from pydantic import SecretStr

from my_bot_ai.features.skills.capabilities import DEFAULT_TOOL_REGISTRY, ToolRegistry


def github_mcp_tool(
    server_url: str,
    authorization: SecretStr,
    *,
    allowed_tools: Sequence[str] | None = None,
    tool_registry: ToolRegistry = DEFAULT_TOOL_REGISTRY,
) -> dict[str, object]:
    """Build an allowlisted GitHub MCP descriptor without exposing credentials."""
    if not tool_registry.connection_allowed("github"):
        raise ValueError("GitHub MCP is not enabled in the tool registry")
    return {
        "type": "mcp",
        "server_label": "github",
        "server_url": server_url,
        "authorization": authorization.get_secret_value(),
        "allowed_tools": list(tool_registry.allowed_tools("github", allowed_tools)),
        "require_approval": "never",
    }
