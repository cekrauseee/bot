"""In-process skill registry with bundled and file-backed sources."""

from pathlib import Path

from my_bot_ai.features.skills.contracts import Skill, SkillMetadata
from my_bot_ai.features.skills.loader import load_skill, scan_skills


class SkillRegistry:
    def __init__(self, roots: tuple[Path, ...] = ()) -> None:
        self._metadata: dict[str, SkillMetadata] = {}
        for root in roots:
            self.register_many(scan_skills(root))

    def register(self, metadata: SkillMetadata) -> None:
        if metadata.id in self._metadata:
            raise ValueError(f"duplicate skill id: {metadata.id}")
        self._metadata[metadata.id] = metadata

    def register_many(self, skills: tuple[SkillMetadata, ...]) -> None:
        for skill in skills:
            self.register(skill)

    def list(self) -> tuple[SkillMetadata, ...]:
        return tuple(self._metadata.values())

    def get(self, skill_id: str, *, load: bool = False) -> SkillMetadata | Skill:
        metadata = self._metadata.get(skill_id)
        if metadata is None:
            raise KeyError(f"unknown skill: {skill_id}")
        return load_skill(metadata.path, include_body=True) if load else metadata


def default_skill_registry() -> SkillRegistry:
    return SkillRegistry((Path(__file__).with_name("bundled"),))
