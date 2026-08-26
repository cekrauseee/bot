# myBOT

myBOT is a portfolio project for a modern AI agent. The repository currently contains a polished, non-functional login mockup and a minimal HTTP API foundation.

## Repository

- `apps/web`: Vite, React, React Router, Tailwind CSS 4, and beUI.
- `apps/api`: Python 3.14 and FastAPI.

## Development

Install the workspace dependencies, then run either application:

```bash
npm install
uv sync --project apps/api
npm run dev:web
npm run dev:api
```

Run all automated checks with `npm run check`.

See the [developer documentation](docs/index.md) for architecture, setup, and project boundaries.
