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

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
OPENROUTER_MODELS: dict[ModelName, str] = {
    "glm-5.2": "z-ai/glm-5.2:free",
}


def ensure_provider_available(settings: Settings, model: ModelName) -> None:
    """Reject an unavailable provider without exposing credentials or provider errors."""

    provider = MODEL_CAPABILITIES[model].provider
    if provider == "openai" and not settings.openai_api_key:
        raise ProviderMissingError
    if provider == "xai" and not settings.xai_api_key:
        raise ProviderMissingError
    if provider == "openrouter" and not settings.openrouter_api_key:
        raise ProviderMissingError


def build_chat_model(
    settings: Settings,
    model: ModelName,
    reasoning_effort: ReasoningEffort | None,
    speed: Speed,
    *,
    streaming: bool = True,
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
            streaming=streaming,
        )
        return llm, resolved

    if resolved.provider == "xai":
        if not settings.xai_api_key:
            raise ProviderMissingError
        llm = ChatXAI(
            model=resolved.model,
            api_key=settings.xai_api_key,
            reasoning_effort=resolved.reasoning_effort,
            streaming=streaming,
        )
        return llm, resolved

    if not settings.openrouter_api_key:
        raise ProviderMissingError
    llm = ChatOpenAI(
        model=OPENROUTER_MODELS[resolved.model],
        api_key=settings.openrouter_api_key,
        base_url=OPENROUTER_BASE_URL,
        use_responses_api=False,
        extra_body={
            "reasoning": {
                "effort": resolved.reasoning_effort,
                "exclude": True,
            }
        },
        streaming=streaming,
    )
    return llm, resolved


def provider_builtin_tools(resolved: ResolvedModelSettings) -> list[dict[str, Any]]:
    """Keep hosted search on the OpenAI Responses integration only."""

    if resolved.provider == "openai":
        return [{"type": "web_search"}]
    return []
