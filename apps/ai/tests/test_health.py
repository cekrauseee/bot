from fastapi.testclient import TestClient

from my_bot_ai.main import app, create_app

client = TestClient(app)


def test_health_endpoint_identifies_ai_service() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "ai"}


def test_health_endpoint_has_no_api_prefix() -> None:
    response = client.get("/api/health")

    assert response.status_code == 404


def test_application_factory_accepts_typed_settings() -> None:
    application = create_app()

    assert application.title == "myBot AI"
    assert application.state.settings.service_name == "ai"
