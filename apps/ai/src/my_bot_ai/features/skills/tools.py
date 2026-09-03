"""Model-visible progressive skill loading tool."""
from typing import Annotated

from langchain_core.callbacks.manager import adispatch_custom_event
from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

from my_bot_ai.features.skills.contracts import SkillMetadata
from my_bot_ai.features.skills.registry import SkillRegistry


class LoadSkillInput(BaseModel):
    skill_id: str = Field(min_length=1, max_length=100)


async def _dispatch_skill_event(name: str, metadata: SkillMetadata, status: str) -> None:
    """Best-effort telemetry; loading must not fail because a callback is absent."""
    try:
        await adispatch_custom_event(
            name,
            {
                "skill": {
                    "id": metadata.id,
                    "name": metadata.name,
                    "status": status,
                }
            },
        )
    except Exception:
        # LangChain only provides a callback context while a graph is running.
        # The tool remains usable in direct calls and event sinks cannot mask a
        # real skill-loading failure.
        return


def build_load_skill_tool(registry: SkillRegistry) -> StructuredTool:
    async def load_skill(skill_id: Annotated[str, "Registered skill ID"] = "") -> str:
        metadata = registry.get(skill_id)
        await _dispatch_skill_event("skill.started", metadata, "in_progress")
        status = "completed"
        try:
            skill = registry.get(skill_id, load=True)
            return skill.body
        except Exception:
            status = "failed"
            raise
        finally:
            await _dispatch_skill_event("skill.completed", metadata, status)

    return StructuredTool.from_function(
        coroutine=load_skill,
        name="load_skill",
        description="Load full instructions for a registered Agent Skill by ID.",
        args_schema=LoadSkillInput,
    )
