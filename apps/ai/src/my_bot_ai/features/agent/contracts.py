"""Versioned internal agent request and normalized event contracts."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import PurePosixPath
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

ProviderName = Literal["openai", "xai"]
ModelName = Literal[
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "gpt-5.6-luna",
    "grok-4.6",
    "grok-4.3",
]
ReasoningEffort = Literal["none", "low", "medium", "high", "xhigh", "max"]
Speed = Literal["standard", "fast"]
NormalizedEventType = Literal[
    "turn.started",
    "reasoning.delta",
    "text.delta",
    "step.started",
    "step.updated",
    "step.completed",
    "plan.updated",
    "user.input_required",
    "tool.started",
    "tool.updated",
    "tool.completed",
    "child.started",
    "child.completed",
    "browser.frame",
    "turn.completed",
    "turn.failed",
]


@dataclass(frozen=True, slots=True)
class ModelCapabilities:
    """Provider-owned capabilities exposed by the product contract."""

    provider: ProviderName
    reasoning_efforts: frozenset[ReasoningEffort]
    speeds: frozenset[Speed]
    default_reasoning_effort: ReasoningEffort | None = None


OPENAI_EFFORTS: frozenset[ReasoningEffort] = frozenset(
    {"none", "low", "medium", "high", "xhigh", "max"}
)
MODEL_CAPABILITIES: dict[ModelName, ModelCapabilities] = {
    "gpt-5.6-sol": ModelCapabilities(
        "openai",
        OPENAI_EFFORTS,
        frozenset({"standard", "fast"}),
        default_reasoning_effort="medium",
    ),
    "gpt-5.6-terra": ModelCapabilities(
        "openai",
        OPENAI_EFFORTS,
        frozenset({"standard", "fast"}),
        default_reasoning_effort="medium",
    ),
    "gpt-5.6-luna": ModelCapabilities(
        "openai",
        OPENAI_EFFORTS,
        frozenset({"standard", "fast"}),
        default_reasoning_effort="medium",
    ),
    "grok-4.6": ModelCapabilities(
        "xai",
        frozenset({"low", "medium", "high", "xhigh"}),
        frozenset({"standard"}),
        default_reasoning_effort="high",
    ),
    "grok-4.3": ModelCapabilities(
        "xai",
        frozenset({"none", "low", "medium", "high"}),
        frozenset({"standard"}),
        default_reasoning_effort="medium",
    ),
}


@dataclass(frozen=True, slots=True)
class ResolvedModelSettings:
    model: ModelName
    provider: ProviderName
    reasoning_effort: ReasoningEffort
    speed: Speed


def resolve_model_settings(
    model: ModelName, reasoning_effort: ReasoningEffort | None, speed: Speed
) -> ResolvedModelSettings:
    """Validate a model request against the explicit product capability registry."""

    capabilities = MODEL_CAPABILITIES[model]
    resolved_effort = reasoning_effort or capabilities.default_reasoning_effort
    if resolved_effort is None:
        raise ValueError("reasoning_effort is required for the selected model")
    if resolved_effort not in capabilities.reasoning_efforts:
        raise ValueError(f"reasoning_effort is not supported by {model}")
    if speed not in capabilities.speeds:
        raise ValueError(f"speed is not supported by {model}")
    return ResolvedModelSettings(model, capabilities.provider, resolved_effort, speed)


class Message(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["user", "assistant"]
    content: str = Field(min_length=1)


class ResumeInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    question_id: str = Field(min_length=1, max_length=200)
    answer: str | list[str]

    @model_validator(mode="after")
    def validate_answer(self) -> ResumeInput:
        if isinstance(self.answer, str):
            if not self.answer.strip():
                raise ValueError("answer must not be empty")
        elif not self.answer or any(not item.strip() for item in self.answer):
            raise ValueError("answer choices must not be empty")
        return self


class PlanStep(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=200)
    title: str = Field(min_length=1, max_length=500)
    status: Literal["pending", "in_progress", "completed"]


class AgentRequest(BaseModel):
    """Strict v2 request accepted only from the application API."""

    model_config = ConfigDict(extra="forbid")

    version: Literal[2]
    run_id: UUID
    turn_id: UUID
    workspace_id: UUID
    conversation_id: UUID
    user_id: UUID
    messages: list[Message] = Field(min_length=1)
    model: ModelName
    reasoning_effort: ReasoningEffort
    speed: Speed
    working_directory: str = Field(default="/workspace", max_length=4_096)
    task_plan: list[PlanStep] = Field(default_factory=list, max_length=50)
    resume: ResumeInput | None = None

    @model_validator(mode="after")
    def validate_working_directory(self) -> AgentRequest:
        value = self.working_directory
        if (
            "\\" in value
            or any(ord(character) < 32 or ord(character) == 127 for character in value)
            or any(part == ".." for part in PurePosixPath(value).parts)
            or not value.startswith("/")
        ):
            raise ValueError(
                "working_directory must be an absolute canonical path inside /workspace"
            )
        canonical = str(PurePosixPath(value))
        if canonical != value:
            raise ValueError("working_directory must be canonical")
        if not (canonical == "/workspace" or canonical.startswith("/workspace/")):
            raise ValueError("working_directory must be inside /workspace")
        return self

    @model_validator(mode="after")
    def validate_model_capabilities(self) -> AgentRequest:
        resolve_model_settings(self.model, self.reasoning_effort, self.speed)
        return self


class NormalizedEvent(BaseModel):
    """Internal normalized event; only JSON-compatible data crosses HTTP."""

    model_config = ConfigDict(extra="forbid")

    type: NormalizedEventType
    data: dict[str, Any] = Field(default_factory=dict)
