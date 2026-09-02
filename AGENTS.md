# Project Guidelines

## Architecture

- Keep the product in a polyglot monorepo: `apps/*` contains runnable services, while `packages/*` contains reusable packages such as `packages/email`. `apps/web` is the Vite frontend, `apps/api` is the Node.js/Elysia application API, and `apps/ai` is the Python/FastAPI AI boundary.
- Use Turborepo for the JavaScript/TypeScript task graph. Keep Python dependencies and execution owned by `uv`; the AI npm manifest is only a Turbo discovery wrapper and must not add Python dependencies to npm.
- Keep frontend code feature-based. Pages compose features; shared components remain domain-neutral.
- Define routes outside the React tree and lazy-load page modules through React Router.
- Keep business and interaction logic out of page components. Move reusable logic to feature hooks or services.

## Interface

- Build interfaces by composing the existing official shadcn/Base UI components before writing custom interactive UI.
- Add or update shadcn components only through the official shadcn CLI and registry. Review generated source after every CLI operation.
- Use Tailwind CSS 4 semantic tokens for styling. Do not hardcode light and dark colors in components.
- Support light and dark appearances, with the system preference as the default.
- Keep motion restrained, purposeful, accessible, and compatible with `prefers-reduced-motion`.

## Technology

- Use current stable technology versions unless compatibility, security, or ecosystem constraints justify otherwise.
- Verify foundational dependency versions and official guidance before upgrades.
