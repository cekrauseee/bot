# Development

## Prerequisites

- Node.js 22.22 or newer.
- npm 11.
- Python 3.14, managed automatically by `uv` when unavailable locally.
- `uv` 0.12 or newer.
- Docker with Compose for the dedicated PostgreSQL and Redis services.

## Setup

From the repository root:

```bash
npm run setup
```

The setup script:

- installs the npm workspace and Python AI lockfiles. A marker under `node_modules` records a fingerprint of the root npm lockfile, Turbo configuration, npm workspace manifests, and `apps/ai/pyproject.toml`, `apps/ai/uv.lock`, and `apps/ai/.python-version` only after both installs succeed; changing any of these dependency inputs invalidates readiness and reruns installation;
- builds the `@my-bot/email` workspace package consumed by the API;
- creates the canonical root `.env` when absent and aligns existing values to `.env.example` order;
- generates independent local authentication, AI, and runtime service secrets without printing or replacing existing values;
- builds the cached local agent-runtime image with Node.js, Chromium, and agent-browser;
- starts the dedicated PostgreSQL and Redis services;
- applies all database migrations;
- verifies the database schema and migration history before reporting readiness.

The root `.env.example` is the complete environment contract. The API, AI service, Vite, database commands, and development scripts all read the root `.env`; shell variables retain precedence. Setup preserves existing documented values, adds newly documented variables, reapplies the canonical grouping and order, and rejects undocumented assignments without printing their values.

The environment groups runtime mode, infrastructure, service origins, internal secrets, provider credentials, and optional tooling in that order. `VITE_API_BASE_URL` is the only value exposed to browser code. The other values remain server-side.

| Group | Variables | Development behavior |
| --- | --- | --- |
| Runtime | `ENVIRONMENT` | Must be `development`, `test`, or `production` |
| Infrastructure | `DATABASE_URL`, `REDIS_URL` | Required explicitly; setup copies the dedicated local origins |
| Service origins | `WEB_BASE_URL`, `API_BASE_URL`, `VITE_API_BASE_URL`, `AI_BASE_URL`, `RUNTIME_BASE_URL` | Required explicitly and used by startup, CORS, and service clients |
| Runtime service | `RUNTIME_PORT`, `RUNTIME_ENVIRONMENT`, `RUNTIME_PROVIDER` | Port must match `RUNTIME_BASE_URL`; development defaults to local Docker and production requires Vercel |
| Internal security | `SESSION_SECRET`, `OTP_PEPPER`, `RATE_LIMIT_PEPPER`, `AI_SERVICE_TOKEN`, `RUNTIME_SERVICE_TOKEN` | Setup generates independent values without printing them |
| Providers | `OPENAI_API_KEY`, `XAI_API_KEY`, `OPENROUTER_API_KEY`, `CODEX_BINARY`, `CODEX_HOME_ROOT`, Vercel variables, Google variables, `RESEND_API_KEY`, `RESEND_FROM` | External credentials may remain placeholders or empty during local UI work |
| Optional tooling | `MYBOT_SEED_USER_EMAIL` | Selects an explicit account for `db:seed` when set |

Add Google and Resend credentials to `.env`, register `http://localhost:8000/auth/google/callback`, then run `npm run auth:check`. Set `OPENAI_API_KEY`, `XAI_API_KEY`, or `OPENROUTER_API_KEY` for real model requests through the corresponding provider. The Codex subscription connection requires the `codex` executable on the API host. Set `CODEX_LOGIN_MODE=browser` for local or desktop browser login; it uses a loopback callback and requires the browser to reach the API host. Set `CODEX_LOGIN_MODE=device` for cloud or headless login; it returns a verification URL and one-time code. The mode is validated explicitly, defaults to browser outside production and device in production, and never silently falls back. Development uses an isolated temporary `CODEX_HOME_ROOT` when none is configured. Production leaves the connection unavailable until `CODEX_HOME_ROOT` points to an absolute durable, encrypted volume. Runtime tools work locally through Docker without Vercel credentials. Set `RUNTIME_PROVIDER=vercel` and add Vercel OIDC or access-token credentials only when testing the production provider. Setup never provisions or prints provider keys.

## Daily Development

```bash
npm run dev
```

After ensuring `.env` exists, this command reads the Vite, Elysia, FastAPI, and runtime ports from `WEB_BASE_URL`, `API_BASE_URL`, `AI_BASE_URL`, and `RUNTIME_PORT`. Runtime startup also requires `RUNTIME_PORT` to match `RUNTIME_BASE_URL`. If a port is occupied, startup stops with one line per service showing its port, process, and PID, followed by a single command to stop all identified owners. PID discovery uses `lsof` when available; otherwise the log provides an inspection command. Nothing is stopped automatically. Verify the PIDs before running the command, or use `Ctrl+C` in the existing development terminal, then retry `npm run dev`.

Once the ports are available, the command ensures environment files, dependencies, infrastructure, and migrations are ready, then starts the services. Vite retains `strictPort` to prevent silently switching ports if a conflict appears after the check. The Turbo process remains attached to the root development process so terminal or host shutdown cannot orphan package watchers. `Ctrl+C` stops every application process; the API releases its listener before closing Redis and PostgreSQL clients. Open the rebuild at `http://localhost:5173`; the legacy web application remains available at `http://localhost:5174`. Use `localhost`, not `127.0.0.1`, so the configured browser origin matches.

Stop the background database and Redis containers when they are no longer needed:

```bash
npm run infra:stop
```

The application does not support proxy-specific environment settings. The API uses the direct socket peer for IP-based authentication limits, and production database connections go directly to Neon.

When starting development, the scripts check ports `5434` and `6380` before invoking Docker Compose. A healthy PostgreSQL or Redis container from the current Compose project and service configuration is reused. If another process or Compose project owns either port, startup stops with a friendly message and does not stop it automatically.

The npm lockfile at the repository root covers the `apps/*` applications and `packages/*` packages. Turbo schedules package-owned lint, typecheck, test, build, and development tasks; the Python wrapper delegates to `uv`, which remains the Python dependency manager. AI settings optionally discover the canonical root `.env` from a source checkout, while shell environment overrides retain precedence; missing dotenv files are harmless. The Python dependency inputs live at `apps/ai/pyproject.toml`, `apps/ai/uv.lock`, and `apps/ai/.python-version`.

## Commands

Run `npm run help` for the current command guide. The primary workflows are:

| Command | Purpose |
| --- | --- |
| `npm run help` | Show the categorized command guide |
| `npm run setup` | Bootstrap dependencies, environment, infrastructure, and migrations |
| `npm run dev` | Prepare and run the web, API, AI, and runtime services together |
| `npm run verify` | Run the complete repository and authentication integration verification |
| `npm run check` | Run checks and production builds without integration infrastructure |

Operational commands:

| Command | Purpose |
| --- | --- |
| `npm run auth:check` | Check whether external Google and Resend variables are configured |
| `npm run infra:start` | Start the dedicated PostgreSQL and Redis containers |
| `npm run infra:stop` | Stop local PostgreSQL and Redis containers without deleting data |
| `npm run infra:reset` | Recreate local PostgreSQL and Redis containers and delete their data |
| `npm run db:generate` | Generate a migration from the Drizzle schema |
| `npm run db:migrate` | Apply pending database migrations |
| `npm run db:check` | Check migration history and the required database contract |
| `npm run db:seed` | Seed complete local conversations and Markdown examples |

`infra:reset` is destructive for local infrastructure: it removes this Compose project's containers, volumes, and orphan containers before starting PostgreSQL and Redis again. It does not remove Docker images or repository files.

`npm run db:seed` is development-only and idempotent. It seeds five complete conversations across the sidebar date groups, including rich Markdown, reasoning summaries, searches, steps, tool activity, and trace examples. The data is assigned to the most recently active local user, the only existing user, or a dedicated `demo@mybot.local` user in that order. Set `MYBOT_SEED_USER_EMAIL` for an explicit account. Re-running the command refreshes the curated seeded messages without deleting later turns.

Seeded UUIDs are application database identifiers only. Conversation continuations are rebuilt from ordered `role` and `content` pairs, and the AI service keeps provider storage disabled; seeded IDs are never sent as OpenAI response or message references.

Project-specific commands remain available for focused development and diagnosis:

| Project | Development | Quality | Build |
| --- | --- | --- | --- |
| API | `api:dev` | `api:lint`, `api:typecheck`, `api:test`, `api:test:integration` | `api:build` |
| AI | `ai:dev` | `ai:lint`, `ai:test` | — |
| Web | `web:dev` | `web:lint`, `web:typecheck`, `web:test` | `web:build` |
| Runtime | `runtime:dev` | `runtime:lint`, `runtime:typecheck`, `runtime:test` | `runtime:build` |
| Email | `email:dev` | `email:typecheck` | `email:build` |
| Automation | — | `scripts:lint`, `scripts:test` | — |

Prefix every entry with `npm run`, for example `npm run api:test`.

The API workspace also exposes `npm run db:migrate:production --workspace @my-bot/api` and `npm run db:check:production --workspace @my-bot/api` for running migration and schema checks from compiled `dist` artifacts. The root `db:migrate` and `db:check` commands remain the local development workflow. Development and test use a local `pg.Pool`; production always connects directly to a `*.neon.tech` database through Neon Serverless with the Node `ws` constructor.

To add a beUI component, inspect and install it from `apps/web`:

```bash
npx shadcn@latest search @beui -q "component name"
npx shadcn@latest add @beui/component-name --dry-run
npx shadcn@latest add @beui/component-name --view
npx shadcn@latest add @beui/component-name
```

## Testing

Run one command before handing off a change:

```bash
npm run verify
```

It prepares the runtime, runs cached Turbo unit checks and builds, executes the PostgreSQL and Redis integration suite without caching, and checks the Drizzle migration history and relational contract. The focused `npm run api:test:integration` command builds `@my-bot/email` first and runs every `*.integration.test.ts` file serially against the shared local database; it requires the local Compose services.

The web quality commands also include `npm run web:test` for conversation protocol and temporal-grouping tests. Interface work should be checked in both appearances, at narrow widths, with keyboard navigation, and with reduced motion.

## Conventions

Repository-specific implementation constraints live in [`AGENTS.md`](../AGENTS.md). Keep public developer documentation concise, factual, and in English.
