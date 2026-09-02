# myBot

myBot is a portfolio project for a durable cloud agent. It combines passwordless email and Google authentication, persistent conversations, a Python AI boundary, and an isolated tool runtime.

## Repository

- `apps/web`: Vite, React, React Router, Tailwind CSS 4, and official shadcn/Base UI components.
- `apps/desktop`: Electron 44 shell packaging the canonical `apps/web` build.
- `apps/api`: Node.js, TypeScript, Elysia, Drizzle, PostgreSQL, and Redis.
- `apps/ai`: Python and FastAPI model-provider boundary.
- `apps/runtime`: isolated filesystem, process, and browser tools.
- `packages/email`: React Email source used by the API.

## Development

```bash
npm run setup
npm run dev
```

Use `npm run help` for the current command guide. `npm run check` runs repository lint, typecheck, tests, and builds; `npm run verify` adds integration checks. Turbo owns JavaScript/TypeScript tasks and `uv` owns Python dependencies.

Build the unsigned desktop package with `npm run desktop:package`. The build reads only the public `WEB_BASE_URL` and `VITE_API_BASE_URL` origins from the root environment and embeds them in a small packaged config; secrets are never embedded. `npm run desktop:install` is macOS-only, stages a fresh `myBot.app`, and retains a recoverable backup before replacing the current-user installation. Signing and notarization remain release concerns.

See [developer documentation](docs/index.md) for architecture, setup, and module boundaries.
