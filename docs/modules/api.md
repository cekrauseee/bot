# HTTP API

## Responsibility

`apps/api` is the Python service boundary for myBOT. It uses Python 3.14, FastAPI, Pydantic, and `uv`.

## Structure

- `src/my_bot_api/main.py`: application factory and exported ASGI app.
- `src/my_bot_api/routers/health.py`: health contract and route.
- `tests`: endpoint and application tests.

## Current Contract

`GET /health` returns:

```json
{"status": "ok"}
```

The response is validated by the `HealthResponse` Pydantic model and covered by `tests/test_health.py`. The service does not add an `/api` path prefix because the API is hosted on its own domain.

## Dependency Management

`pyproject.toml` defines runtime and development dependencies. `uv.lock` records the resolved environment. FastAPI is pinned to the verified minor release; transitive Starlette and Pydantic versions remain under FastAPI's dependency contract.
