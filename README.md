# myBOT

myBOT is a portfolio project for a modern AI agent. The current foundation includes passwordless email and Google authentication backed by the Python service.

## Repository

- `apps/web`: Vite, React, React Router, Tailwind CSS 4, and beUI.
- `apps/api`: Python 3.14, FastAPI, PostgreSQL, and Redis.
- `apps/emails`: React Email source for transactional messages.

## Development

Install the workspace dependencies, then run either application:

```bash
npm install
uv sync --project apps/api
npm run dev:infra
npm run db:migrate
npm run dev:web
npm run dev:api
```

Run all automated checks with `npm run check`.

See the [developer documentation](docs/index.md) for architecture, setup, and project boundaries.
