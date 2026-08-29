import pytest

from my_bot_ai.config import Settings, repository_env_path
from my_bot_ai.main import create_app


def test_repository_env_path_is_optional_and_source_checkout_aware() -> None:
    path = repository_env_path()

    assert path.name == ".env"
    assert (path.parent / "apps" / "ai" / "pyproject.toml").is_file()


def test_missing_env_file_uses_safe_defaults(tmp_path) -> None:
    settings = Settings(_env_file=tmp_path / "missing.env")

    assert settings.environment == "development"
    assert settings.service_name == "ai"


def test_env_file_is_loaded_and_process_environment_wins(tmp_path, monkeypatch) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text("ENVIRONMENT=production\n", encoding="utf-8")

    monkeypatch.delenv("ENVIRONMENT", raising=False)
    assert Settings(_env_file=env_file).environment == "production"
    monkeypatch.setenv("ENVIRONMENT", "test")
    assert Settings(_env_file=env_file).environment == "test"


def test_production_rejects_placeholder_service_and_provider_secrets() -> None:
    with pytest.raises(ValueError, match="AI_SERVICE_TOKEN"):
        create_app(
            Settings(
                environment="production",
                ai_service_token="replace-with-a-service-secret-at-least-32-characters",
                openai_api_key="replace-with-an-openai-key",
            )
        )

    with pytest.raises(ValueError, match="OPENAI_API_KEY"):
        create_app(
            Settings(
                environment="production",
                ai_service_token="a-strong-service-token-that-is-long-enough",
                openai_api_key="replace-with-an-openai-key",
            )
        )
