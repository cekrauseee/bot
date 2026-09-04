# Development

## Prerequisites

- Node.js 22.22 or newer and npm 11.
- Python 3.14 and `uv` 0.12 or newer.
- Docker Compose for local PostgreSQL and Redis.

## Setup

From the repository root:

```bash
npm run setup
npm run dev
```

Setup aligns the root `.env` with `.env.example`, generates local service secrets and the Base64 GitHub token-encryption key without printing them, installs workspace dependencies, builds email assets, starts infrastructure, and applies migrations. Existing secrets are preserved. `npm run dev` launches both the browser and Electron applications with the API, AI, and runtime services. The root environment is shared by Vite, the API, AI, and runtime. `VITE_API_BASE_URL` is the only browser-exposed value. Google, GitHub OAuth, and Resend credentials are optional for local UI work.

Use `localhost` with the documented origins (`WEB_BASE_URL=http://localhost:5173`, `API_BASE_URL=http://localhost:8000`). `npm run infra:stop` stops the dedicated containers; `infra:reset` deletes their local data.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run check` | Lint, typecheck, tests, and builds |
| `npm run verify` | Full repository and integration verification |
| `npm run api:test` | API unit and contract tests |
| `npm run web:test` | Web unit tests |
| `npm run scripts:test` | Root script tests |
| `npm run desktop:package` | Build an ad hoc signed desktop package |
| `npm run desktop:make` | Build Forge distributables |
| `npm run desktop:install` | Stage and install `myBot.app` on macOS |
| `npm run icons:build` | Regenerate deterministic icon assets |

Desktop builds generate a public config artifact from the root `.env` and process overrides. It contains only validated HTTP(S) origins; the packaged app does not depend on Finder inheriting shell variables. The installer is deliberately not part of ordinary checks, validates the copied bundle before replacing the current installation, and keeps a timestamped backup of an existing user installation.

## Environment

Service origins, provider credentials, internal secrets, and runtime settings are documented in `.env.example`. Keep credentials in the server environment. Do not add undocumented variables or put secrets in frontend code, desktop public config, URLs, or logs.

## UI contribution

Use existing shadcn/Base UI components and the project aliases. Prefer semantic tokens, `gap-*` layout utilities, native controls, visible focus states, and restrained motion compatible with reduced-motion preferences. Keep pages small and move interaction logic into feature hooks or services.
