"""OpenAI chat-model construction."""

from typing import Any

from langchain_core.language_models import BaseChatModel
from langchain_openai import ChatOpenAI

from my_bot_ai.config import Settings
from my_bot_ai.features.agent.contracts import (
    ModelName,
    ReasoningEffort,
    ResolvedModelSettings,
    Speed,
    resolve_model_settings,
)
from my_bot_ai.features.agent.errors import ProviderMissingError


def ensure_provider_available(settings: Settings, model: ModelName) -> None:
    """Reject an unavailable OpenAI integration without exposing credentials."""

    if not settings.openai_api_key:
        raise ProviderMissingError


def build_chat_model(
    settings: Settings,
    model: ModelName,
    reasoning_effort: ReasoningEffort | None,
    speed: Speed,
    *,
    streaming: bool = True,
) -> tuple[BaseChatModel, ResolvedModelSettings]:
    """Build the OpenAI Responses integration with validated product settings."""

    resolved = resolve_model_settings(model, reasoning_effort, speed)
    if not settings.openai_api_key:
        raise ProviderMissingError
    llm = ChatOpenAI(
        model=resolved.model,
        api_key=settings.openai_api_key,
        use_responses_api=True,
        store=False,
        reasoning={"effort": resolved.reasoning_effort, "summary": "auto"},
        service_tier="fast" if resolved.speed == "fast" else "default",
        streaming=streaming,
    )
    return llm, resolved


def provider_builtin_tools(resolved: ResolvedModelSettings) -> list[dict[str, Any]]:
    """Expose OpenAI-hosted search to every supported model."""

    return [{"type": "web_search"}]
