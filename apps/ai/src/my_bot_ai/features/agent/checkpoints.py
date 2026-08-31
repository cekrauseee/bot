"""LangGraph checkpointer factories for local tests and durable production runs."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from langgraph.checkpoint.memory import InMemorySaver
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.checkpoint.serde.jsonplus import JsonPlusSerializer

from my_bot_ai.config import Settings

LOCAL_DATABASE_URL = "postgresql://mybot:mybot@localhost:5434/mybot"


def strict_checkpoint_serializer() -> JsonPlusSerializer:
    """Allow only LangGraph's built-in safe msgpack types and never pickle."""

    return JsonPlusSerializer(
        pickle_fallback=False,
        allowed_json_modules=None,
        allowed_msgpack_modules=None,
    )


def create_in_memory_checkpointer() -> InMemorySaver:
    """Create an isolated saver for tests or explicit dependency injection."""

    return InMemorySaver(serde=strict_checkpoint_serializer())


@asynccontextmanager
async def postgres_checkpointer(database_url: str) -> AsyncIterator[AsyncPostgresSaver]:
    """Open and initialize the official asynchronous PostgreSQL checkpointer."""

    async with AsyncPostgresSaver.from_conn_string(
        database_url, serde=strict_checkpoint_serializer()
    ) as checkpointer:
        await checkpointer.setup()
        yield checkpointer


@asynccontextmanager
async def checkpointer_for_settings(settings: Settings) -> AsyncIterator[Any]:
    """Use PostgreSQL in normal runtimes and memory only in the test environment."""

    if settings.environment == "test":
        yield create_in_memory_checkpointer()
        return
    database_url = settings.database_url
    if settings.environment == "development":
        database_url = database_url or LOCAL_DATABASE_URL
    if not database_url:
        raise ValueError("DATABASE_URL must be configured in production")
    async with postgres_checkpointer(database_url) as checkpointer:
        yield checkpointer
