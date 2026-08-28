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

- installs the npm workspace and Python AI lockfiles. A marker under `node_modules` records a fingerprint of the root npm lockfile and npm workspace manifests only after both installs succeed; changing branches or those npm dependency files invalidates readiness and reruns installation;
- creates `.env` and `apps/web/.env` only when absent;
- generates three independent local authentication secrets without printing or replacing existing values;
- starts the dedicated PostgreSQL and Redis services;
- applies all database migrations.

It reports the remaining Google and Resend variables without blocking local UI development. Add those provider credentials to `.env`, register `http://localhost:8000/auth/google/callback`, then run `npm run auth:check`. React Email templates are rendered locally during setup and development; Resend needs no hosted template configuration.

## Daily Development

```bash
npm run dev
```

This command ensures environment files, dependencies, infrastructure, email artifacts, and migrations are ready. It then runs the Elysia API on `8000`, the FastAPI AI service on `8001`, and Vite on `5173`. `Ctrl+C` stops every application process. Open `http://localhost:5173`; use `localhost`, not `127.0.0.1`, so the configured browser origin matches.

Stop the background database and Redis containers when they are no longer needed:

```bash
npm run infra:stop
```

`TRUSTED_PROXY_HOSTS` is an optional comma-separated allowlist of immediate proxy IP addresses. Only a request whose direct peer is in this list may supply exactly one valid address in `X-Forwarded-For`; all other forwarded headers are ignored. In production, set `VITE_API_BASE_URL` in `apps/web/.env` to the API sibling origin.

When starting development, the scripts check ports `5434` and `6380` before invoking Docker Compose. A healthy PostgreSQL or Redis container from the current Compose project and service configuration is reused. If another process or Compose project owns either port, startup stops with a friendly message and does not stop it automatically.

The npm lockfile at the repository root covers the web, email, and Elysia API workspaces. The Python lockfile lives at `apps/ai/uv.lock`.

## Commands

Run `npm run help` for the current command guide. The primary workflows are:

| Command | Purpose |
| --- | --- |
| `npm run help` | Show the categorized command guide |
| `npm run setup` | Bootstrap dependencies, environment, infrastructure, and migrations |
| `npm run dev` | Prepare and run the web, Elysia API, and FastAPI AI service together |
| `npm run verify` | Run the complete repository and authentication integration verification |
| `npm run check` | Run checks and production builds without integration infrastructure |

Operational commands:

| Command | Purpose |
| --- | --- |
| `npm run auth:check` | Check whether external Google and Resend variables are configured |
| `npm run db:generate` | Generate a migration from the Drizzle schema |
| `npm run db:migrate` | Apply pending database migrations |
| `npm run db:check` | Check migration history and the required database contract |
| `npm run infra:start` | Start the dedicated PostgreSQL and Redis containers |
| `npm run infra:stop` | Stop local PostgreSQL and Redis containers without deleting data |
| `npm run infra:reset` | Recreate local PostgreSQL and Redis containers and delete their data |

`infra:reset` is destructive for local infrastructure: it removes this Compose project's containers, volumes, and orphan containers before starting PostgreSQL and Redis again. It does not remove Docker images or repository files.

Project-specific commands remain available for focused development and diagnosis:

| Project | Development | Quality | Build |
| --- | --- | --- | --- |
| API | `api:dev` | `api:lint`, `api:test`, `api:test:integration` | `api:build` |
| AI | `ai:dev` | `ai:lint`, `ai:test` | — |
| Web | `web:dev` | `web:lint` | `web:build` |
| Emails | `emails:dev` | `emails:check`, `emails:typecheck` | `emails:render`, `emails:build` |
| Automation | — | `scripts:lint`, `scripts:test` | — |

Prefix every entry with `npm run`, for example `npm run api:test`.

The API workspace also exposes `npm run db:migrate:production --workspace @my-bot/api` and `npm run db:check:production --workspace @my-bot/api` for running migration and schema checks from compiled `dist` artifacts. The root `db:migrate` and `db:check` commands remain the local development workflow.

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

It prepares the runtime, runs unit checks and builds, executes the PostgreSQL and Redis authentication integration suite, and checks the Drizzle migration history and relational contract.

Interface work should also be checked in both appearances, at narrow widths, with keyboard navigation, and with reduced motion.

## Conventions

Repository-specific implementation constraints live in [`AGENTS.md`](../AGENTS.md). Keep public developer documentation concise, factual, and in English.
