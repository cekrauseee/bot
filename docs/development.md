# Development

## Prerequisites

- Node.js 22.22 or newer.
- npm 11.
- Python 3.14, managed automatically by `uv` when unavailable locally.
- `uv` 0.12 or newer.

## Setup

From the repository root:

```bash
npm install
uv sync --project apps/api
```

The frontend lockfile lives at the repository root. The API lockfile lives at `apps/api/uv.lock`.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev:web` | Start the Vite development server |
| `npm run dev:api` | Start FastAPI in development mode |
| `npm run lint:web` | Run Oxlint on the frontend |
| `npm run lint:api` | Run Ruff on the API |
| `npm run test:api` | Run API tests with pytest |
| `npm run build:web` | Type-check and build the frontend |
| `npm run check` | Run every automated repository check |

To add a beUI component, inspect and install it from `apps/web`:

```bash
npx shadcn@latest search @beui -q "component name"
npx shadcn@latest add @beui/component-name --dry-run
npx shadcn@latest add @beui/component-name --view
npx shadcn@latest add @beui/component-name
```

## Testing

Run `npm run check` before handing off a change. It currently verifies frontend lint and production build, API lint, and the API health test.

Interface work should also be checked in both appearances, at narrow widths, with keyboard navigation, and with reduced motion. Browser verification was intentionally stopped for the initial login implementation at the user's request.

## Conventions

Repository-specific implementation constraints live in [`AGENTS.md`](../AGENTS.md). Keep public developer documentation concise, factual, and in English.
