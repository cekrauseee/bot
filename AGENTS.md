# Project Guidelines

## Architecture

- Keep the product in a polyglot monorepo: `apps/web` for the Vite frontend and `apps/api` for the FastAPI backend.
- Keep frontend code feature-based. Pages compose features; shared components remain domain-neutral.
- Define routes outside the React tree and lazy-load page modules through React Router.
- Keep business and interaction logic out of page components. Move reusable logic to feature hooks or services.

## Interface

- Build interfaces by composing existing beUI components before writing custom interactive UI.
- Add or update beUI components only through the shadcn CLI and the `@beui` registry. Review generated source after every CLI operation.
- Use Tailwind CSS 4 semantic tokens for styling. Do not hardcode light and dark colors in components.
- Support light and dark appearances, with the system preference as the default.
- Keep motion restrained, purposeful, accessible, and compatible with `prefers-reduced-motion`.

## Technology

- Use current stable technology versions unless compatibility, security, or ecosystem constraints justify otherwise.
- Verify foundational dependency versions and official guidance before upgrades.
