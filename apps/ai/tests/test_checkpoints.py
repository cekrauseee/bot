from contextlib import asynccontextmanager
from unittest.mock import patch

import anyio
from langgraph.checkpoint.memory import InMemorySaver

from my_bot_ai.config import Settings
from my_bot_ai.features.agent.checkpoints import (
    LOCAL_DATABASE_URL,
    checkpointer_for_settings,
    postgres_checkpointer,
    strict_checkpoint_serializer,
)


def test_checkpoint_serializer_disables_pickle_and_uses_strict_allowlist() -> None:
    serializer = strict_checkpoint_serializer()
    assert serializer.pickle_fallback is False
    assert serializer._allowed_json_modules is None
    assert serializer._allowed_msgpack_modules is None


def test_postgres_factory_initializes_official_saver() -> None:
    class FakeSaver:
        setup_called = False

        async def setup(self) -> None:
            self.setup_called = True

    saver = FakeSaver()

    @asynccontextmanager
    async def fake_connection(_url, **kwargs):
        assert kwargs["serde"].pickle_fallback is False
        yield saver

    async def run() -> None:
        with patch(
            "my_bot_ai.features.agent.checkpoints.AsyncPostgresSaver.from_conn_string",
            side_effect=fake_connection,
        ):
            async with postgres_checkpointer("postgresql://db/agent") as active:
                assert active is saver
        assert saver.setup_called is True

    anyio.run(run)


def test_checkpointer_selection_is_durable_outside_tests() -> None:
    seen_urls: list[str] = []

    @asynccontextmanager
    async def fake_postgres(url):
        seen_urls.append(url)
        yield "postgres"

    async def run() -> None:
        with patch(
            "my_bot_ai.features.agent.checkpoints.postgres_checkpointer",
            side_effect=fake_postgres,
        ):
            async with checkpointer_for_settings(
                Settings(environment="development", database_url=LOCAL_DATABASE_URL)
            ) as saver:
                assert saver == "postgres"
            async with checkpointer_for_settings(
                Settings(environment="production", database_url="postgresql://db/prod")
            ) as saver:
                assert saver == "postgres"
        async with checkpointer_for_settings(Settings(environment="test")) as saver:
            assert isinstance(saver, InMemorySaver)

    anyio.run(run)
    assert seen_urls == [LOCAL_DATABASE_URL, "postgresql://db/prod"]
