# AI Service

## Responsibility

`apps/ai` is the Python boundary for model providers and agent execution. It does not own browser authentication, user persistence, sessions, transactional email, or product HTTP contracts.

## Structure

- `src/my_bot_ai/main.py`: FastAPI application factory and exported ASGI app.
- `src/my_bot_ai/config.py`: typed service configuration.
- `src/my_bot_ai/features`: feature-owned routers and future model integrations.
- `src/my_bot_ai/features/agent`: authenticated agent request schema, LangChain model factory, event normalization, and SSE framing.
- `tests`: isolated service tests.

## Current Contract

`GET /health` returns:

```json
{"status": "ok", "service": "ai"}
```

The service runs on port `8001` in local development and is called only by the application API.

`POST /agent/stream` accepts only `Authorization: Bearer <AI_SERVICE_TOKEN>`. Its strict request includes the text transcript, conversation and turn identifiers, model, reasoning effort, and speed. The response protocol contains `turn.started`, reasoning and text deltas, real web-search step updates, and terminal completion or failure events.

The current model factory supports `gpt-5.6-sol` and `gpt-5.6-luna`. It uses LangChain's compiled agent graph, OpenAI Responses, built-in web search, reasoning summaries, `store=false`, and standard or Fast processing. Provider-native blocks are normalized before crossing the service boundary. Raw chain-of-thought, credentials, provider errors, and prompt contents are not logged or returned.

The service reads `ENVIRONMENT`, `AI_BASE_URL`, `AI_SERVICE_TOKEN`, and the optional development `OPENAI_API_KEY` from the canonical root `.env`. Its development runner binds to the host and port declared by `AI_BASE_URL`. A real turn returns a safe service-unavailable response until the provider key exists. Production startup requires both a strong `AI_SERVICE_TOKEN` and a configured `OPENAI_API_KEY`.

## Dependency Management

`pyproject.toml` defines Python, FastAPI, LangChain, and `langchain-openai` dependencies. `uv.lock` records the resolved environment. The minimal `package.json` is a Turbo discovery wrapper: its scripts delegate to `uv`; it does not duplicate Python dependencies in npm.
