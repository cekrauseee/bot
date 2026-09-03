"""Resolve selected skills and compose temporary system guidance."""

from my_bot_ai.features.skills.contracts import Skill
from my_bot_ai.features.skills.registry import SkillRegistry


def resolve_skills(registry: SkillRegistry, ids: tuple[str, ...]) -> tuple[Skill, ...]:
    return tuple(registry.get(skill_id, load=True) for skill_id in ids)  # type: ignore[misc]


def skill_guidance(skills: tuple[Skill, ...]) -> str:
    return "\n\n".join(
        f"Temporary skill guidance ({skill.metadata.id}):\n{skill.body}" for skill in skills
    )


def skill_catalog(registry: SkillRegistry) -> str:
    """Compact metadata catalog suitable for the root system prompt."""
    return "Available skills (call load_skill to load one): " + "; ".join(
        f"{item.id}: {item.description}" for item in registry.list()
    )
