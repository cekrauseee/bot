"""Explicit capability contracts; skill text never grants access."""
from collections.abc import Sequence
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class ToolSpec:
    id: str
    risk: str = "read-only"
    connection: str | None = None


class ToolRegistry:
    def __init__(self, specs: tuple[ToolSpec, ...] = ()) -> None:
        self._specs: dict[str, ToolSpec] = {}
        for spec in specs:
            if spec.id in self._specs:
                raise ValueError(f"duplicate tool id: {spec.id}")
            self._specs[spec.id] = spec

    def get(self, tool_id: str) -> ToolSpec | None:
        return self._specs.get(tool_id)

    def list(self) -> tuple[ToolSpec, ...]:
        return tuple(self._specs.values())

    def connection_allowed(self, connection: str) -> bool:
        """Whether this registry exposes any hosted tools for a connection."""
        return any(spec.connection == connection for spec in self._specs.values())

    def allowed_tools(
        self, connection: str, requested: Sequence[str] | None = None
    ) -> tuple[str, ...]:
        """Return only registry-approved tool IDs for a hosted connection.

        ``requested`` can narrow the approved set, but unknown IDs and skill
        metadata can never widen it.  Registry order is stable for descriptors.
        """
        approved = tuple(
            spec.id for spec in self._specs.values() if spec.connection == connection
        )
        if requested is None:
            return approved
        requested_ids = set(requested)
        return tuple(tool_id for tool_id in approved if tool_id in requested_ids)


DEFAULT_TOOL_REGISTRY = ToolRegistry(
    (
        ToolSpec("search_repositories", connection="github"),
        ToolSpec("get_file_contents", connection="github"),
    )
)
