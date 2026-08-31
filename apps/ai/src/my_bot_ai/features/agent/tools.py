"""Small provider-neutral tools used by the LangGraph agent."""

import json
from collections.abc import Awaitable, Callable, Sequence
from typing import Annotated, Any

from langchain_core.tools import BaseTool, InjectedToolCallId, StructuredTool
from langgraph.types import interrupt
from pydantic import BaseModel, ConfigDict, Field, model_validator

from my_bot_ai.features.agent.contracts import (
    MODEL_CAPABILITIES,
    ModelName,
    PlanStep,
    ReasoningEffort,
    Speed,
)
from my_bot_ai.features.agent.errors import InvalidResumeError

ChildRunner = Callable[
    [str, str, ModelName | None, ReasoningEffort | None, Speed | None],
    Awaitable[str],
]


class QuestionOption(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=200)
    label: str = Field(min_length=1, max_length=500)
    description: str | None = Field(default=None, max_length=2_000)


class AskUserQuestion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=200)
    title: str = Field(min_length=1, max_length=500)
    description: str = Field(min_length=1, max_length=2_000)
    options: list[QuestionOption] = Field(default_factory=list, max_length=20)
    multiple: bool = False
    allow_custom: bool = False

    @model_validator(mode="after")
    def validate_options(self) -> AskUserQuestion:
        option_ids = [option.id for option in self.options]
        if len(option_ids) != len(set(option_ids)):
            raise ValueError("question option ids must be unique")
        if not self.options and not self.allow_custom:
            raise ValueError("a question needs options or allow_custom")
        return self


class AskUserInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    questions: list[AskUserQuestion] = Field(min_length=1, max_length=20)

    @model_validator(mode="after")
    def validate_question_ids(self) -> AskUserInput:
        question_ids = [question.id for question in self.questions]
        if len(question_ids) != len(set(question_ids)):
            raise ValueError("question ids must be unique")
        return self


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
    """Create interrupt, plan, and child-delegation tools for one run."""

    def ask_user(questions: list[dict[str, Any]]) -> str:
        parsed = AskUserInput(questions=questions).questions
        answers: list[dict[str, Any]] = []
        for question in parsed:
            payload = question.model_dump(mode="json")
            payload["question_id"] = question.id
            resumed = interrupt(payload)
            answer = _validated_answer(question, resumed)
            answers.append({"question_id": question.id, "answer": answer})
        return json.dumps({"answers": answers}, separators=(",", ":"))

    def update_plan(plan: list[dict[str, Any]]) -> str:
        serialized = [PlanStep.model_validate(step).model_dump(mode="json") for step in plan]
        return json.dumps({"plan": serialized}, separators=(",", ":"))

    return (
        StructuredTool.from_function(
            func=ask_user,
            name="ask_user",
            description="Pause this run and ask the user one or more necessary questions.",
            args_schema=AskUserInput,
        ),
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


def _validated_answer(question: AskUserQuestion, resumed: Any) -> str | list[str]:
    if not isinstance(resumed, dict) or resumed.get("question_id") != question.id:
        raise InvalidResumeError
    answer = resumed.get("answer")
    if question.multiple:
        if not isinstance(answer, list) or not answer:
            raise InvalidResumeError
        if any(not isinstance(item, str) or not item.strip() for item in answer):
            raise InvalidResumeError
        if len(answer) != len(set(answer)):
            raise InvalidResumeError
        values = answer
    else:
        if not isinstance(answer, str) or not answer.strip():
            raise InvalidResumeError
        values = [answer]

    option_ids = {option.id for option in question.options}
    if not question.allow_custom and any(value not in option_ids for value in values):
        raise InvalidResumeError
    return answer
