"""Stable contracts for file-backed Agent Skills (SKILL.md)."""

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True, slots=True)
class SkillMetadata:
    name: str
    description: str
    path: Path
    allowed_tools: tuple[str, ...] = ()
    license: str | None = None
    compatibility: str | None = None
    metadata: dict[str, str] | None = None

    @property
    def id(self) -> str:
        """Return the registry identifier, derived from the spec name."""
        return self.name


@dataclass(frozen=True, slots=True)
class Skill:
    metadata: SkillMetadata
    body: str
