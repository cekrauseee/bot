"""Small provider-neutral tools used by the LangGraph agent."""

import json
from collections.abc import Awaitable, Callable, Sequence
from typing import Annotated, Any

from langchain_core.tools import BaseTool, InjectedToolCallId, StructuredTool
from pydantic import BaseModel, ConfigDict, Field, model_validator

from my_bot_ai.features.agent.contracts import (
    MODEL_CAPABILITIES,
    ModelName,
    PlanStep,
    ReasoningEffort,
    Speed,
)

ChildRunner = Callable[
    [str, str, ModelName | None, ReasoningEffort | None, Speed | None],
    Awaitable[str],
]


class UpdatePlanInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    plan: list[PlanStep] = Field(min_length=1, max_length=50)


class DelegateInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    task: str = Field(min_length=1, max_length=20_000)
    model: ModelName | None = None
    reasoning_effort: ReasoningEffort | None = None
    speed: Speed | None = None
    tool_call_id: Annotated[str, InjectedToolCallId]

    @model_validator(mode="after")
    def validate_model_overrides(self) -> DelegateInput:
        if self.model is None:
            return self
        capabilities = MODEL_CAPABILITIES[self.model]
        if (
            self.reasoning_effort is not None
            and self.reasoning_effort not in capabilities.reasoning_efforts
        ):
            raise ValueError("reasoning_effort is not supported by the child model")
        if self.speed is not None and self.speed not in capabilities.speeds:
            raise ValueError("speed is not supported by the child model")
        return self


def build_core_tools(child_runner: ChildRunner) -> Sequence[BaseTool]:
    """Create plan and child-delegation tools for one run."""

    def update_plan(plan: list[dict[str, Any]]) -> str:
        serialized = [PlanStep.model_validate(step).model_dump(mode="json") for step in plan]
        return json.dumps({"plan": serialized}, separators=(",", ":"))

    return (
        StructuredTool.from_function(
            func=update_plan,
            name="update_plan",
            description="Replace the task's single shared concise macro execution plan.",
            args_schema=UpdatePlanInput,
        ),
        _delegation_tool(child_runner),
    )


def _delegation_tool(child_runner: ChildRunner) -> BaseTool:
    async def delegate_to_child_agent(
        task: str,
        tool_call_id: Annotated[str, InjectedToolCallId],
        model: ModelName | None = None,
        reasoning_effort: ReasoningEffort | None = None,
        speed: Speed | None = None,
    ) -> str:
        return await child_runner(task, tool_call_id, model, reasoning_effort, speed)

    return StructuredTool.from_function(
        coroutine=delegate_to_child_agent,
        name="delegate_to_child_agent",
        description=(
            "Delegate one bounded task to a durable child agent. Optionally choose "
            "its model, reasoning effort, and processing speed."
        ),
        args_schema=DelegateInput,
    )


def build_child_delegation_tool(child_runner: ChildRunner) -> BaseTool:
    """Expose recursive delegation without giving child agents user-facing tools."""

    return _delegation_tool(child_runner)
