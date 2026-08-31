"""Provider-aware LangChain chat-model construction."""

from typing import Any

from langchain_core.language_models import BaseChatModel
from langchain_openai import ChatOpenAI
from langchain_xai import ChatXAI

from my_bot_ai.config import Settings
from my_bot_ai.features.agent.contracts import (
    MODEL_CAPABILITIES,
    ModelName,
    ReasoningEffort,
    ResolvedModelSettings,
    Speed,
    resolve_model_settings,
)
from my_bot_ai.features.agent.errors import ProviderMissingError


def ensure_provider_available(settings: Settings, model: ModelName) -> None:
    """Reject an unavailable provider without exposing credentials or provider errors."""

    provider = MODEL_CAPABILITIES[model].provider
    if provider == "openai" and not settings.openai_api_key:
        raise ProviderMissingError
    if provider == "xai" and not settings.xai_api_key:
        raise ProviderMissingError


def build_chat_model(
    settings: Settings,
    model: ModelName,
    reasoning_effort: ReasoningEffort | None,
    speed: Speed,
) -> tuple[BaseChatModel, ResolvedModelSettings]:
    """Build the dedicated provider integration with validated product settings."""

    resolved = resolve_model_settings(model, reasoning_effort, speed)
    if resolved.provider == "openai":
        if not settings.openai_api_key:
            raise ProviderMissingError
        llm = ChatOpenAI(
            model=resolved.model,
            api_key=settings.openai_api_key,
            use_responses_api=True,
            store=False,
            reasoning={"effort": resolved.reasoning_effort, "summary": "auto"},
            service_tier="fast" if resolved.speed == "fast" else "default",
            streaming=True,
        )
        return llm, resolved

    if not settings.xai_api_key:
        raise ProviderMissingError
    llm = ChatXAI(
        model=resolved.model,
        api_key=settings.xai_api_key,
        reasoning_effort=resolved.reasoning_effort,
        streaming=True,
    )
    return llm, resolved


def provider_builtin_tools(resolved: ResolvedModelSettings) -> list[dict[str, Any]]:
    """Keep OpenAI hosted search on OpenAI and never forward it to xAI."""

    if resolved.provider == "openai":
        return [{"type": "web_search"}]
    return []
