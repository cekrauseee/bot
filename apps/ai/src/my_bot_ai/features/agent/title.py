"""Application-owned conversation-title generation."""

from typing import Final

from my_bot_ai.config import Settings
from my_bot_ai.features.agent.contracts import (
    ConversationTitleRequest,
    ConversationTitleResponse,
    ModelName,
)
from my_bot_ai.features.agent.models import build_chat_model

TITLE_MODEL: Final[ModelName] = "gpt-5.6-luna"
TITLE_INSTRUCTIONS: Final[str] = (
    "Create a concise conversation title from the user's first message. "
    "Use the same language as the message, preserve important product and code terms, "
    "prefer two to seven words, and do not use quotes or terminal punctuation."
)


async def generate_conversation_title(
    body: ConversationTitleRequest,
    settings: Settings,
) -> ConversationTitleResponse:
    """Generate one bounded title without changing the main agent response contract."""

    model, _resolved = build_chat_model(
        settings,
        TITLE_MODEL,
        "low",
        "standard",
        streaming=False,
    )
    structured = model.with_structured_output(
        ConversationTitleResponse,
        method="json_schema",
        strict=True,
    )
    result = await structured.ainvoke([
        ("system", TITLE_INSTRUCTIONS),
        ("human", body.message),
    ])
    return ConversationTitleResponse.model_validate(result)
