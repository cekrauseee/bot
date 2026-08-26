# myBot

myBot is a portfolio project for a modern AI agent. The current foundation includes passwordless email and Google authentication backed by the Python service.

## Repository

- `apps/web`: Vite, React, React Router, Tailwind CSS 4, and beUI.
- `apps/api`: Python 3.14, FastAPI, PostgreSQL, and Redis.
- `apps/emails`: React Email source for transactional messages.

## Development

Discover the available workflows at any time:

```bash
npm run help
```

Prepare the complete local environment once:

```bash
npm run setup
```

Then start PostgreSQL, Redis, migrations, FastAPI, and Vite with:

```bash
npm run dev
```

Run the complete unit, integration, lint, migration, and build verification with `npm run verify`.

See the [developer documentation](docs/index.md) for architecture, setup, and project boundaries.
