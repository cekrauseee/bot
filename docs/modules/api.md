# HTTP API

## Responsibility

`apps/api` is the functional application API for Bot. It runs TypeScript on Node.js with Elysia, Drizzle, PostgreSQL, Redis, OpenID Connect, and Resend. It is an npm workspace and remains independent from the Python AI service.

## Structure

- `src/app.ts`: Elysia application factory, cross-cutting HTTP behavior, and typed route composition.
- `src/config.ts`: validated environment configuration and production guardrails.
- `src/modules/auth`: OTP, Google OpenID Connect, and session services.
- `src/modules/conversations.ts`: private AI client and public conversation serialization.
- `src/modules/agent-control-plane.ts`: leased execution, checkpoint projection, event replay, Redis fanout, and WebSocket transport.
- `src/modules/provider-connections.ts`: provider-agnostic connection contracts, adapter registry types, errors, and persisted activation settings.
- `src/modules/codex-app-server.ts`: isolated Codex process lifecycle, ChatGPT browser or device login, account state, and rate-limit projection.
- `src/modules/models.ts`: OpenAI GPT model capability catalog.
- `src/db`: Drizzle schema, repository, connection, migration, drift checks, and local application seed.
- `src/email.ts`: React Email composition and Resend delivery.
- `drizzle`: versioned SQL migrations.
- `tests`: unit and PostgreSQL/Redis integration coverage.

## Current Contract

`GET /health` returns:

```json
{"status": "ok"}
```

The response is validated by an Elysia runtime schema and covered by API tests. Authentication routes live under `/auth`; their stable behavior is documented in [Authentication](authentication.md). The service does not add an `/api` path prefix because the API is hosted on its own domain. Interactive OpenAPI documentation is available at `/openapi`, with its JSON document at `/openapi/json`.

Authenticated provider-connection routes are:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/provider-connections` | List every registered connection with its provider, status, and active state |
| `GET` | `/provider-connections/:connectionId` | Return safe connection, account, limit, and active state |
| `PATCH` | `/provider-connections/:connectionId` | Persist `{ active: boolean }` for the connected provider |
| `POST` | `/provider-connections/:connectionId/logins` | Start an owned login using the registered adapter |
| `GET` | `/provider-connections/:connectionId/logins/:loginId` | Poll one owned login attempt |
| `DELETE` | `/provider-connections/:connectionId/logins/:loginId` | Cancel one owned login attempt |
| `DELETE` | `/provider-connections/:connectionId` | Remove the provider credentials and mark the provider inactive |

`:connectionId` identifies a concrete connection method such as `openai-codex`; the registry maps it to the model provider `openai` and a provider-specific adapter. Common Elysia handlers own authentication, route validation, login lifecycle, activation, and disconnection. Unknown connection IDs return 404. The adapter owns vendor-specific login, account, limits, credentials, and errors. PostgreSQL stores activation by user and model provider, so disabling a provider also blocks selecting its models and starting runs without deleting its credentials.

The OpenAI Codex adapter communicates with Codex app-server over JSONL `stdio`. `CODEX_LOGIN_MODE` is explicitly validated as `browser` or `device`, defaults to browser outside production and device in production, and has no silent fallback. That configured mode applies to web clients; authenticated desktop requests always use browser callback login. Browser mode returns `auth_url` and uses the app-server's local success page instead of the hosted Codex or ChatGPT success page. Device mode returns `verification_url` and `user_code`. In both modes, the `account/login/completed` notification remains authoritative for connection success. Each application user receives a separate HMAC-derived `CODEX_HOME`; app-server uses file-backed credential storage and refreshes ChatGPT tokens itself. Public responses contain only login URLs/codes, safe account metadata, and normalized rate-limit windows. Provider tokens and native error bodies do not enter PostgreSQL, Redis, browser responses, or logs. Production exposes the connection only when an absolute durable `CODEX_HOME_ROOT` is configured.

The built-in `github` connection uses browser OAuth with PKCE. The one-time Redis state record is authoritative; an HttpOnly signed cookie provides optional browser-side state binding and is not required for system-browser or desktop completion. The login record stores whether the request originated from web or desktop. After the API exchanges the callback code, both targets redirect to `/connections/github/callback`; desktop requests include `target=desktop` so that page can attempt the validated `mybot://connections/github/callback` deep link and retain an explicit fallback link. The API stores GitHub access and refresh tokens encrypted at rest in the per-user `github_connections` row. The OAuth App requests the `repo` scope because it is the minimum OAuth scope that permits private repository reads; the MCP tool allowlist remains read-only. Public connection responses expose only status, safe account metadata, and the persisted active flag. The same provider-connection routes support unavailable, disconnected, connecting/polling, connected, cancellation, disconnection, and active-state changes. When GitHub is configured, an active connected account is resolved per run; its token is used to inject a private read-only GitHub MCP descriptor into the root AI request and is never sent to the browser or persisted in the run.

Authenticated conversation routes are:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/conversations` | List the current user's conversations newest first |
| `GET` | `/conversations/:conversationId` | Load messages, task plan, and the current active-run projection |
| `PATCH` | `/conversations/:conversationId` | Rename an owned conversation with `{ title: string }` |
| `POST` | `/conversations/turns` | Create a conversation and stream its first turn |
| `POST` | `/conversations/:conversationId/turns` | Stream a turn in an existing conversation |
| `DELETE` | `/conversations/:conversationId` | Delete an inactive owned conversation |
| `PATCH` | `/conversations/:conversationId/pin` | Set `{ pinned: boolean }` for an owned conversation |
| `PATCH` | `/conversations/pinned-order` | Reorder the complete owned pinned set using `{ conversation_ids: string[] }` |

Conversation summaries include nullable `pinned_order` and `pin_updated_at`. Pinning appends to the pinned order and preserves `project_id` and `updated_at`; unpinning clears the order. Pin/reorder requests serialize on the owning user row, and pin timestamps advance monotonically. Reordering rejects duplicate, missing, foreign, or unpinned IDs with 409 without partial writes. Pinned conversations reject all explicit project assignments, including moves to Recents, until unpinned.

Conversation renames normalize whitespace, keep chat activity timestamps and project/pin membership unchanged, and advance a separate `title_updated_at` clock.

Projects expose nullable `sort_order` and `order_updated_at`. `PATCH /projects/order` accepts `{ project_ids: string[] }` containing the complete current owned set and returns the reordered projects. Invalid or stale sets return 409 without partial writes. Create, delete, and reorder serialize on the user row. Unordered/new projects precede ordered projects, with creation time and ID descending as tie-breakers; renaming does not change the chosen order.

Agent control routes are:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/models` | Return supported GPT model, reasoning, and speed capabilities |
| `GET` | `/agent-runs` | List the current user's active runs for reload and global tracking |
| `GET` | `/agent-runs/:runId` | Load one owned run projection |
| `GET` | `/agent-runs/:runId/events?after=` | Replay a bounded page of durable events |
| `POST` | `/agent-runs/:runId/cancel` | Request cancellation without deleting run history |
| WebSocket | `/agent-runs/:runId/subscribe?after=` | Replay then stream durable events and transient browser frames |

Starting a turn creates a durable run and returns an initial `text/event-stream` `turn.started` handshake with a v2 envelope; the WebSocket owns post-acceptance events. PostgreSQL assigns the public decimal event sequence. The executor validates the AI service sequence, fences every write with a renewable execution token, stores partial state, and completes only after a valid terminal event. One active run is allowed per conversation across application instances.

The v2 event contract includes `skill.started` and `skill.completed` alongside tool and child-agent lifecycle events. Skill events carry a stable per-call `skill.id`, the validated skill identifier in `skill.skill_id`, and `name`, plus optional `detail` and `status` fields. Reasoning activities use the AI-supplied stable `activity_id` when present, with sequence-derived IDs retained as a historical fallback; title events can interleave without splitting the reasoning projection.

While the first run executes, the API requests a title from the separate AI title endpoint. It persists the normalized result and `conversation.title.updated` in one fenced transaction only while `title_updated_at` is null; title generation runs in the background and cannot delay terminal turn persistence. A manual rename therefore wins every race. Recovery may retry a failed title request, while the conditional update keeps the operation idempotent. Generated titles update `title_updated_at` but not `updated_at`, so they do not reorder Recents.

`GET /agent-runs` returns every queued, running, or cancelling run owned by the authenticated user plus the current metadata snapshot for each active conversation. The web application merges those snapshots with the conversation catalog by `title_updated_at`, which closes title-update races between the parallel catalog requests. It then rebuilds sidebar pending state and route-independent WebSocket subscriptions without inferring active work from Redis or client memory.

The API preserves validated request and correlation IDs in response headers and forwards them to the immediate AI execution or cancellation attempt. Recovered background work has no originating HTTP request and therefore starts a new logging context inside the worker boundary. Logs exclude prompts, message content, credentials, cookies, and provider reasoning.

Runs may continue after the initiating HTTP connection closes. Conversation detail uses a repeatable-read snapshot so persisted messages, `event_cursor`, and the `active_run` cursor cannot describe different event boundaries. Run WebSockets use Redis/process fanout only as wake hints; a serialized PostgreSQL tail pump reads durable events in order and periodically reconciles the high-water mark, repairing missed cross-instance messages while a socket remains open. Browser images are validated and fanned out separately without a database insert. Each API process keeps the latest frame for an active run in memory and sends it immediately to late WebSocket subscribers; terminal run events clear that cache. Browser frames are intentionally process-local and are not restored after an API process restart until another frame arrives.

Conversation details expose one current task `plan`, projected from the latest nonempty run snapshot, and an additive decimal `event_cursor` captured in the same repeatable-read transaction as messages and `active_run`. New runs inherit that plan and pass it to the AI service as context. Plan updates replace the current snapshot; they do not create message blocks or independent plans per turn.

Projects expose a stable `workspace_path` through the existing authenticated `GET /projects` and `POST /projects` routes. Creation stores `/workspace/projects/<initial-slug-prefix>-<project-id>` without calling the runtime. Paths use at most 48 Unicode code points from the initial slug and the full project UUID, so renaming preserves references and recreating a deleted project cannot adopt its files. Existing projects receive paths through the non-destructive migration.

Each new run snapshots its owned conversation's project path into `working_directory`, or `/workspace` when unassigned. The executor uses the stored value throughout that run, even if the conversation moves or project metadata changes. The following run uses the conversation's new assignment. Pre-migration runs keep `/workspace` to preserve existing tool effects. Folder selection, file browsing, and project lifecycle UI are outside this change.

The first AI event contains its LangGraph checkpoint projection. When that checkpoint advanced beyond the API, Elysia replaces stale assistant text, records the reconciled checkpoint ID, and then applies new deltas. Expired execution leases are reclaimed periodically; stale executors cannot append events or change the assistant.

Existing-conversation turn requests may include `retry_of`, the UUID of the latest failed assistant message. Under the owning conversation lock, the API verifies that the prompt matches its preceding user message and that no turn is streaming. It resets and reuses that assistant row, keeping the user message once. Older, completed, mismatched, or already-running attempts return 409; another user's conversation returns 404. New-conversation requests cannot include `retry_of`.

## Dependency Management

`package.json` defines runtime and development dependencies. The repository root `package-lock.json` records the complete npm workspace graph. Turbo runs package-owned TypeScript, Oxlint, Vitest, and production build tasks; integration tests and Drizzle migration checks are explicitly non-cached external-state tasks. Local and test connections use `pg.Pool`; production accepts only `*.neon.tech` hosts and connects directly through Neon Serverless with the Node `ws` constructor.

## Database Compatibility

Drizzle owns the schema and migration workflow. After the conversation pin/title and project-order migrations, `0005_lyrical_captain_britain` adds one global workspace per user, durable runs, and append-only events. `0006_yellow_scorpion` adds immutable project workspace paths and frozen run working directories. `0007_crazy_maginty` permits retry attempts to create separate run histories while reusing the failed assistant message. `0010_noisy_korvac` adds the per-user, per-provider activation state. `0014_lively_darkstar` removes the obsolete structured-question columns. `0015_github_connections` adds the per-user encrypted GitHub OAuth connection records. Migration checks verify the complete relational contract before delivery.
