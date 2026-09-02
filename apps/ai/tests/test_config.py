import pytest

from my_bot_ai.config import Settings, repository_env_path
from my_bot_ai.main import create_app


def test_repository_env_path_is_optional_and_source_checkout_aware() -> None:
    path = repository_env_path()

    assert path.name == ".env"
    assert (path.parent / "apps" / "ai" / "pyproject.toml").is_file()


def test_missing_env_file_requires_explicit_runtime_settings(tmp_path, monkeypatch) -> None:
    monkeypatch.delenv("ENVIRONMENT", raising=False)
    monkeypatch.delenv("AI_SERVICE_TOKEN", raising=False)

    with pytest.raises(ValueError):
        Settings(_env_file=tmp_path / "missing.env")


def test_env_file_is_loaded_and_process_environment_wins(tmp_path, monkeypatch) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text(
        "ENVIRONMENT=production\n"
        "AI_BASE_URL=http://localhost:8001\n"
        "RUNTIME_BASE_URL=http://localhost:8002\n"
        "AI_SERVICE_TOKEN=test-service-token\n",
        encoding="utf-8",
    )

    monkeypatch.delenv("ENVIRONMENT", raising=False)
    monkeypatch.delenv("AI_SERVICE_TOKEN", raising=False)
    assert Settings(_env_file=env_file).environment == "production"
    monkeypatch.setenv("ENVIRONMENT", "test")
    assert Settings(_env_file=env_file).environment == "test"


def test_legacy_psycopg_database_url_is_normalized() -> None:
    settings = Settings(
        environment="development",
        database_url="postgresql+psycopg://mybot:mybot@localhost:5434/mybot",
    )

    assert settings.database_url == "postgresql://mybot:mybot@localhost:5434/mybot"


def test_production_rejects_placeholder_secrets_and_missing_database() -> None:
    with pytest.raises(ValueError, match="AI_SERVICE_TOKEN"):
        create_app(
            Settings(
                environment="production",
                ai_base_url="https://ai.example.com",
                runtime_base_url="https://runtime.example.com",
                ai_service_token="replace-with-a-service-secret-at-least-32-characters",
                openai_api_key="replace-with-an-openai-key",
            )
        )

    with pytest.raises(ValueError, match="provider key"):
        create_app(
            Settings(
                environment="production",
                ai_base_url="https://ai.example.com",
                runtime_base_url="https://runtime.example.com",
                ai_service_token="a-strong-service-token-that-is-long-enough",
                openai_api_key="replace-with-an-openai-key",
                xai_api_key="",
                openrouter_api_key="",
            )
        )

    with pytest.raises(ValueError, match="DATABASE_URL"):
        create_app(
            Settings(
                environment="production",
                ai_base_url="https://ai.example.com",
                runtime_base_url="https://runtime.example.com",
                ai_service_token="a-strong-service-token-that-is-long-enough",
                openai_api_key="a-valid-provider-key-that-is-long-enough",
                database_url=None,
                runtime_service_token="a-valid-runtime-token-that-is-long-enough",
            )
        )

    with pytest.raises(ValueError, match="RUNTIME_SERVICE_TOKEN"):
        create_app(
            Settings(
                environment="production",
                ai_base_url="https://ai.example.com",
                runtime_base_url="https://runtime.example.com",
                ai_service_token="a-strong-service-token-that-is-long-enough",
                openai_api_key="a-valid-provider-key-that-is-long-enough",
                database_url="postgresql://db/prod",
                runtime_service_token=None,
            )
        )
