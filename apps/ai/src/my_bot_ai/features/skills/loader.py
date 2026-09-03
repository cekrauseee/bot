"""Cheap SKILL.md metadata scanning and explicit full-body loading.

The parser implements the Agent Skills frontmatter contract.  Standard
frontmatter fields are accepted explicitly; extensions belong in ``metadata``
as string-to-string values.  Unknown top-level fields are rejected so a skill
cannot silently depend on product-specific syntax.
"""

import re
from pathlib import Path

import yaml

from my_bot_ai.features.skills.contracts import Skill, SkillMetadata

_FRONTMATTER = re.compile(r"\A---\s*\n(.*?)\n---\s*\n", re.DOTALL)
_VALID_NAME = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
_SUPPORTED_FIELDS = frozenset(
    {"name", "description", "license", "compatibility", "metadata", "allowed-tools"}
)


def _frontmatter(text: str) -> tuple[dict[str, object], str]:
    match = _FRONTMATTER.match(text)
    if not match:
        return {}, text
    try:
        values = yaml.safe_load(match.group(1)) or {}
    except yaml.YAMLError as exc:
        raise ValueError("SKILL.md frontmatter must contain valid YAML") from exc
    if not isinstance(values, dict):
        raise ValueError("SKILL.md frontmatter must be a mapping")
    normalized: dict[str, object] = {}
    for key, value in values.items():
        if not isinstance(key, str):
            raise ValueError("SKILL.md frontmatter keys must be strings")
        normalized[key.lower()] = value
    unknown = sorted(set(normalized) - _SUPPORTED_FIELDS)
    if unknown:
        raise ValueError(
            "unsupported SKILL.md frontmatter field(s): "
            + ", ".join(unknown)
            + "; put extensions under metadata"
        )
    return normalized, text[match.end() :].lstrip()


def _allowed_tools(value: object) -> tuple[str, ...]:
    if value is None:
        return ()
    if not isinstance(value, str):
        raise ValueError("allowed-tools must be a space-separated string")
    return tuple(value.split())


def _metadata(value: object) -> dict[str, str] | None:
    if value is None:
        return None
    if not isinstance(value, dict):
        raise ValueError("metadata must be a string-to-string mapping")
    if any(not isinstance(key, str) or not isinstance(item, str) for key, item in value.items()):
        raise ValueError("metadata must be a string-to-string mapping")
    return dict(value)


def _optional_string(values: dict[str, object], key: str) -> str | None:
    value = values.get(key)
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError(f"{key} must be a string")
    return value


def load_skill(path: Path, *, include_body: bool = True) -> Skill | SkillMetadata:
    """Read one SKILL.md; metadata-only reads do not retain the body."""
    text = path.read_text(encoding="utf-8")
    values, body = _frontmatter(text)
    name = values.get("name")
    description = values.get("description")
    if not isinstance(name, str) or not _VALID_NAME.fullmatch(name) or len(name) > 64:
        raise ValueError("skill name must be lowercase hyphenated and at most 64 characters")
    if name != path.parent.name:
        raise ValueError("skill name must match its containing folder")
    if not isinstance(description, str) or not 1 <= len(description) <= 1024:
        raise ValueError("skill description must be between 1 and 1024 characters")
    compatibility = _optional_string(values, "compatibility")
    if compatibility is not None and len(compatibility) > 500:
        raise ValueError("skill compatibility must be at most 500 characters")
    metadata = SkillMetadata(
        name,
        description,
        path,
        _allowed_tools(values.get("allowed-tools")),
        _optional_string(values, "license"),
        compatibility,
        _metadata(values.get("metadata")),
    )
    if not include_body:
        return metadata
    return Skill(metadata, body)


def scan_skills(root: Path) -> tuple[SkillMetadata, ...]:
    """Discover SKILL.md files while reading only front matter."""
    if not root.exists():
        return ()
    return tuple(load_skill(path, include_body=False) for path in sorted(root.glob("*/SKILL.md")))  # type: ignore[misc]
