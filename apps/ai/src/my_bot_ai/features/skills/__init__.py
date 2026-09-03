"""Agent Skills discovery and progressive loading."""

from my_bot_ai.features.skills.capabilities import (
    DEFAULT_TOOL_REGISTRY,
    ToolRegistry,
    ToolSpec,
)
from my_bot_ai.features.skills.contracts import Skill, SkillMetadata
from my_bot_ai.features.skills.loader import load_skill, scan_skills
from my_bot_ai.features.skills.registry import SkillRegistry, default_skill_registry

__all__ = [
    "Skill",
    "SkillMetadata",
    "ToolRegistry",
    "ToolSpec",
    "DEFAULT_TOOL_REGISTRY",
    "SkillRegistry",
    "default_skill_registry",
    "load_skill",
    "scan_skills",
]
