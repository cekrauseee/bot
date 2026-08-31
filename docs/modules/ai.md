# AI Service

## Responsibility

`apps/ai` is the Python boundary for model providers and agent execution. It does not own browser authentication, user persistence, sessions, transactional email, or product HTTP contracts.

## Structure

- `src/my_bot_ai/main.py`: FastAPI application factory and exported ASGI app.
- `src/my_bot_ai/config.py`: typed service configuration.
- `src/my_bot_ai/features`: feature-owned routers and future model integrations.
- `src/my_bot_ai/features/agent`: request contracts, provider adapters, LangGraph checkpoint recovery, tools, runtime client, event normalization, and SSE framing.
- `tests`: isolated service tests.

## Current Contract

`GET /health` returns:

```json
{"status": "ok", "service": "ai"}
```

The service runs on port `8001` in local development and is called only by the application API.

`POST /agent/stream` accepts only `Authorization: Bearer <AI_SERVICE_TOKEN>`. Its strict v2 request includes stable run, workspace, user, conversation, and turn identifiers plus the transcript and model settings. The response protocol contains checkpoint metadata, safe reasoning and text deltas, web-search steps, plans, questions, runtime tools, child agents, transient browser frames, and terminal events.

The model factory supports OpenAI `gpt-5.6-sol`, `gpt-5.6-terra`, and `gpt-5.6-luna`, plus xAI `grok-4.6` and `grok-4.3`. Each model exposes only its supported reasoning efforts and processing modes. OpenAI uses Responses, built-in web search, `store=false`, and optional Fast processing. xAI uses its dedicated LangChain adapter and never exposes raw `reasoning_content` as a summary.

The root graph exposes simple plan, question, runtime, and child-delegation tools. A child receives only its bounded task, runtime tools, and recursive delegation. Delegation may select model, reasoning effort, and speed. Child threads use stable checkpoint namespaces and do not replay a completed task after recovery. The current safety limit permits four nested child levels; this is an execution bound, not a product behavior harness.

The request may include the conversation's current `task_plan`. It is validated with the same step shape as `update_plan` and supplied only to the root graph as context. `update_plan` replaces that task's single macro plan.

LangGraph uses PostgreSQL checkpoints with synchronous durability outside tests. A request submits transcript messages only to an absent checkpoint. Existing runnable state continues without re-supplying messages; matching user input resumes once; interrupted and completed states are projected without model execution. Every response starts with the checkpoint ID, phase, canonical current-turn text, pending question, and resume-consumption state so the API can repair a stale projection.

Runtime tools call `apps/runtime` with a deterministic operation ID derived from the run, tool call, and tool name. Browser captures become transient custom events and are removed before the tool result reaches the model. The user-control handoff tool remains unavailable to models until a trusted application channel exists.

`OPENAI_API_KEY` and `XAI_API_KEY` are optional at process startup in development. Selecting an unconfigured provider returns a safe service error. Production requires a strong AI service token, a runtime service token, PostgreSQL, and at least one configured model provider.

## Dependency Management

`pyproject.toml` defines Python, FastAPI, LangChain, and `langchain-openai` dependencies. `uv.lock` records the resolved environment. The minimal `package.json` is a Turbo discovery wrapper: its scripts delegate to `uv`; it does not duplicate Python dependencies in npm.
