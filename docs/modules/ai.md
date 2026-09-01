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

`POST /agent/stream` accepts only `Authorization: Bearer <AI_SERVICE_TOKEN>`. Its strict v2 request includes user, workspace, run, conversation, and turn identifiers; the frozen working directory; ordered text messages; task-plan context; model settings; and optional resume input. The response envelope repeats the run and turn identifiers and emits ordered provider-neutral events for checkpoints, reasoning, text, web search, plan updates, runtime tools, child agents, questions, browser frames, completion, and failure.

The model catalog supports GPT-5.6 Sol, Terra, and Luna through OpenAI, Grok 4.6 and 4.3 through xAI, and the free GLM 5.2 route through OpenRouter. Each model resolves only supported reasoning efforts and processing modes. OpenAI uses the Responses API, built-in web search, reasoning summaries, and `store=false`; xAI exposes only explicit reasoning summaries. OpenRouter uses its OpenAI-compatible Chat Completions endpoint, disables returned raw reasoning, and does not receive OpenAI hosted tools. Provider-native blocks, raw chain-of-thought, credentials, and provider errors never cross the service boundary.

The root LangGraph uses the application run UUID as its thread ID and a PostgreSQL checkpointer as durable authority. Child agents derive deterministic nested thread IDs from tool calls, can delegate recursively, and share the root run's runtime tools. Resume processing verifies the pending question and reconciles the latest checkpoint before invoking again, so stale API text or an already-consumed answer is not replayed.

Runtime tools call `apps/runtime` with `RUNTIME_SERVICE_TOKEN`. Filesystem and shell operations start in the run's persisted `working_directory`; absolute paths remain constrained to `/workspace`. Browser captures are removed from model-visible tool results and emitted as transient frames.

The service reads the canonical root `.env`. `ENVIRONMENT`, `AI_BASE_URL`, `AI_SERVICE_TOKEN`, and `RUNTIME_BASE_URL` are required. `DATABASE_URL`, `RUNTIME_SERVICE_TOKEN`, `OPENAI_API_KEY`, `XAI_API_KEY`, and `OPENROUTER_API_KEY` activate their corresponding durable or external capabilities. Its development runner binds to the host and port declared by `AI_BASE_URL`. A real turn returns a safe service-unavailable response when the selected provider is not configured. Production requires a strong internal token, at least one provider key, PostgreSQL checkpoints, and a strong runtime token.

## Dependency Management

`pyproject.toml` defines Python, FastAPI, LangChain, LangGraph PostgreSQL checkpoints, OpenAI, xAI, and structured logging dependencies. `uv.lock` records the resolved environment. The minimal `package.json` is a Turbo discovery wrapper: its scripts delegate to `uv`; it does not duplicate Python dependencies in npm.
