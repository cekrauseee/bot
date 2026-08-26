from fastapi.testclient import TestClient

from my_bot_api.main import app

client = TestClient(app)


def test_health_endpoint() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_health_endpoint_has_no_api_prefix() -> None:
    response = client.get("/api/health")

    assert response.status_code == 404
