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

- installs the npm and Python lockfiles;
- creates `.env` and `apps/web/.env` only when absent;
- generates three independent local authentication secrets without printing or replacing existing values;
- starts the dedicated PostgreSQL and Redis services;
- applies all database migrations.

It reports the remaining Google and Resend variables without blocking local UI development. Add those provider credentials to `.env`, register `http://localhost:8000/auth/google/callback`, publish the Resend template, then run `npm run auth:check`.

## Daily Development

```bash
npm run dev
```

This command ensures environment files, dependencies, infrastructure, and migrations are ready, then runs FastAPI and Vite together. `Ctrl+C` stops both application processes. Open `http://localhost:5173`; use `localhost`, not `127.0.0.1`, so the configured browser origin matches.

Stop the background database and Redis containers when they are no longer needed:

```bash
npm run infra:stop
```

`TRUSTED_PROXY_HOSTS` is an optional comma-separated allowlist of immediate proxy IP addresses. Only a request whose direct peer is in this list may supply exactly one valid address in `X-Forwarded-For`; all other forwarded headers are ignored. In production, set `VITE_API_BASE_URL` in `apps/web/.env` to the API sibling origin.

The frontend lockfile lives at the repository root. The API lockfile lives at `apps/api/uv.lock`.

## Commands

Run `npm run help` for the current command guide. The primary workflows are:

| Command | Purpose |
| --- | --- |
| `npm run help` | Show the categorized command guide |
| `npm run setup` | Bootstrap dependencies, environment, infrastructure, and migrations |
| `npm run dev` | Prepare and run API and web together |
| `npm run verify` | Run the complete repository and authentication integration verification |
| `npm run check` | Run checks and production builds without integration infrastructure |

Operational commands:

| Command | Purpose |
| --- | --- |
| `npm run auth:check` | Check whether external Google and Resend variables are configured |
| `npm run db:migrate` | Apply pending database migrations |
| `npm run infra:start` | Start the dedicated PostgreSQL and Redis containers |
| `npm run infra:stop` | Stop local PostgreSQL and Redis containers without deleting data |

Project-specific commands remain available for focused development and diagnosis:

| Project | Development | Quality | Build |
| --- | --- | --- | --- |
| API | `api:dev` | `api:lint`, `api:test` | — |
| Web | `web:dev` | `web:lint` | `web:build` |
| Emails | `emails:dev` | `emails:typecheck` | `emails:build` |
| Automation | — | `scripts:lint`, `scripts:test` | — |

Prefix every entry with `npm run`, for example `npm run api:test`.

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

It prepares the runtime, runs unit checks and builds, executes the PostgreSQL and Redis authentication integration suite, and checks migration drift.

Interface work should also be checked in both appearances, at narrow widths, with keyboard navigation, and with reduced motion.

## Conventions

Repository-specific implementation constraints live in [`AGENTS.md`](../AGENTS.md). Keep public developer documentation concise, factual, and in English.
