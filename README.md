# myBot

myBot is a portfolio project for a modern AI agent. It includes passwordless email and Google authentication, persistent streamed conversations, and a separate Python service for model execution.

## Repository

- `apps/web`: Vite, React, React Router, Tailwind CSS 4, and beUI.
- `apps/api`: Node.js, TypeScript, Elysia, Drizzle, PostgreSQL, and Redis.
- `apps/ai`: Python 3.14 and FastAPI boundary for model capabilities.
- `packages/email`: React Email source and consumable package for transactional messages.

## Development

Discover the available workflows at any time:

```bash
npm run help
```

Prepare the complete local environment once:

```bash
npm run setup
```

Then start PostgreSQL, Redis, migrations, Elysia, the FastAPI AI service, and Vite with:

```bash
npm run dev
```

Run the complete unit, integration, lint, migration, and build verification with `npm run verify`. Turbo owns the JavaScript/TypeScript task graph; `uv` remains the sole Python dependency manager.

See the [developer documentation](docs/index.md) for architecture, setup, and project boundaries.
