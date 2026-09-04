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

`POST /agent/stream` accepts only `Authorization: Bearer <AI_SERVICE_TOKEN>`. Its strict v2 request includes user, workspace, run, conversation, and turn identifiers; the frozen working directory; ordered text messages; task-plan context; and model settings. The response envelope repeats the run and turn identifiers and emits ordered provider-neutral events for checkpoints, reasoning, text, web search, plan updates, runtime tools, child agents, browser frames, completion, and failure. Reasoning summaries are additive deltas with a stable per-model-invocation `activity_id`; cumulative provider summaries are suffix-diffed before emission so reasoning before and after tools remains chronologically distinct. Hosted MCP calls always expose a stable-ID `tool.started` -> optional `tool.updated` -> terminal lifecycle, synthesizing a start when the provider first reports a completed result without leaking tool output.

`POST /agent/title` uses the same service authentication and accepts a strict v1 request containing run ownership identifiers plus the first user message. It invokes application-owned GPT-5.6 Luna with low reasoning, standard processing, `store=false`, and a strict `{ title }` structured-output schema. The request is independent from the main agent stream and does not expose tools or alter the user-selected model.

The model catalog supports GPT-5.6 Sol, Terra, and Luna through OpenAI only. Each model supports the same reasoning efforts and standard or fast processing. The service uses the OpenAI Responses API, built-in web search, reasoning summaries, and `store=false`. Raw reasoning, credentials, and provider errors never cross the service boundary.

The root LangGraph uses the application run UUID as its thread ID and a PostgreSQL checkpointer as durable authority. Child agents derive deterministic nested thread IDs from tool calls, can delegate recursively, and share the root run's runtime tools. Checkpoint reconciliation can continue an interrupted execution after process recovery without replaying transcript side effects.

Agent Skills are file-backed `SKILL.md` bundles under `apps/ai/src/my_bot_ai/features/skills/bundled/<id>`. The loader validates the supported Agent Skills front matter (`name`, `description`, `license`, `compatibility`, `metadata`, and `allowed-tools`), including lowercase-hyphenated names, directory identity, descriptions, compatibility bounds, and string metadata. `allowed-tools` is retained as a hint; the authoritative `ToolRegistry` controls exposed capabilities, and skill text cannot grant tools. The registry scans metadata only at startup; the root agent receives a compact catalog and can call `load_skill` to load one skill body progressively. Skill guidance is temporary to the current root run and is root-agent context only. Skill loading emits normalized `skill.started` and `skill.completed` lifecycle events keyed by the model tool-call ID, so repeated loads remain distinct.

When the API supplies `github_mcp`, the AI service adds a provider-neutral, read-only GitHub MCP descriptor only to the root agent. The descriptor is per-run, uses the supplied authorization without placing it in user guidance, and allows only the GitHub tools approved by the authoritative `ToolRegistry` (currently repository search and file-content reads) without approval prompts.

Questions use normal assistant text. The root agent asks only when missing information would materially change the result or create meaningful risk and no safe assumption allows progress. It includes the context and questions needed for the decision, using paragraphs or bullets only when they improve clarity, and then completes the turn. The user's answer starts a normal subsequent turn. There is no fixed question schema or separate continuation protocol.

Runtime tools call `apps/runtime` with `RUNTIME_SERVICE_TOKEN`. Filesystem and shell operations start in the run's persisted `working_directory`; absolute paths remain constrained to `/workspace`. Browser captures are removed from model-visible tool results and emitted as transient frames. Tool exceptions are returned to the model as safe structured failures, so the agent can choose an alternative, ask for input, or explain the blocker without ending the run automatically.

Every browser tool start publishes an active browser projection. Tool results replace it with the runtime lifecycle state. Completed, failed, and cancelled turns clear the projection so a finished run cannot remain visually active.

Runtime calls use action-specific deadlines (short for reads and key presses, longer for shell execution and navigation). The model-visible agent contract also publishes bounded tool-call and failure budgets. The tool-call budget is derived conservatively from the LangGraph recursion limit (one model step plus one tool step per call, with two finalization steps and the recursion margin reserved), so budget feedback arrives before recursion exhaustion. LangGraph runs reserve a recursion margin for finalization; reaching the recursion boundary emits the latest durable partial answer as a truthful completed-with-limit outcome, or a specific execution-budget failure when no useful output exists, rather than a provider failure.

The service reads the canonical root `.env`. `ENVIRONMENT`, `AI_BASE_URL`, `AI_SERVICE_TOKEN`, and `RUNTIME_BASE_URL` are required. `DATABASE_URL`, `RUNTIME_SERVICE_TOKEN`, and `OPENAI_API_KEY` activate their corresponding durable or external capabilities. Its development runner binds to the host and port declared by `AI_BASE_URL`. A real turn returns a safe service-unavailable response when OpenAI is not configured. Production requires a strong internal token, `OPENAI_API_KEY`, PostgreSQL checkpoints, and a strong runtime token.

## Dependency Management

`pyproject.toml` defines Python, FastAPI, LangChain, LangGraph PostgreSQL checkpoints, OpenAI, and structured logging dependencies. `uv.lock` records the resolved environment. The minimal `package.json` is a Turbo discovery wrapper: its scripts delegate to `uv`; it does not duplicate Python dependencies in npm.
