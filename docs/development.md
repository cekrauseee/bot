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
npm install
uv sync --project apps/api
cp .env.example .env
cp apps/web/.env.example apps/web/.env
npm run dev:infra
npm run db:migrate
```

Replace every placeholder secret in `.env`. Register the local Google callback as `http://localhost:8000/auth/google/callback`. The Resend template must be published before email login can deliver codes.

`TRUSTED_PROXY_HOSTS` is an optional comma-separated allowlist of immediate proxy IP addresses. Only a request whose direct peer is in this list may supply exactly one valid address in `X-Forwarded-For`; all other forwarded headers are ignored. In production, set `VITE_API_BASE_URL` in `apps/web/.env` to the API sibling origin.

The frontend lockfile lives at the repository root. The API lockfile lives at `apps/api/uv.lock`.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev:web` | Start the Vite development server |
| `npm run dev:api` | Start FastAPI in development mode |
| `npm run dev:infra` | Start the dedicated PostgreSQL and Redis containers |
| `npm run dev:emails` | Preview React Email templates |
| `npm run db:migrate` | Apply Alembic migrations |
| `npm run lint:web` | Run Oxlint on the frontend |
| `npm run lint:emails` | Type-check the email workspace |
| `npm run lint:api` | Run Ruff on the API |
| `npm run test:api` | Run API tests with pytest |
| `npm run build:web` | Type-check and build the frontend |
| `npm run build:emails` | Build the React Email preview application |
| `npm run check` | Run every automated repository check |

To add a beUI component, inspect and install it from `apps/web`:

```bash
npx shadcn@latest search @beui -q "component name"
npx shadcn@latest add @beui/component-name --dry-run
npx shadcn@latest add @beui/component-name --view
npx shadcn@latest add @beui/component-name
```

## Testing

Run `npm run check` before handing off a change. It verifies both TypeScript workspaces, API lint and unit tests, and both production builds.

Authentication integration tests require the dedicated containers and a migrated database:

```bash
npm run dev:infra
npm run db:migrate
RUN_INTEGRATION_TESTS=1 uv run --project apps/api pytest apps/api/tests/auth/test_auth_integration.py
```

Interface work should also be checked in both appearances, at narrow widths, with keyboard navigation, and with reduced motion.

## Conventions

Repository-specific implementation constraints live in [`AGENTS.md`](../AGENTS.md). Keep public developer documentation concise, factual, and in English.
