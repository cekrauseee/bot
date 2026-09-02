# Web rebuild

This is the authenticated web application rebuild, built with React, TypeScript,
Vite, and shadcn/ui.

## Application structure

The application uses React Router in Declarative Mode. `src/main.tsx` mounts
`AppRouter` directly; there is no application wrapper component.

Route modules live under `src/routes` and mirror their URL segments:

| Route module                                     | URL                              | Responsibility                |
| ------------------------------------------------ | -------------------------------- | ----------------------------- |
| `routes/page.tsx`                                | `/`                              | New conversation page         |
| `routes/conversations/[conversationId]/page.tsx` | `/conversations/:conversationId` | Addressable conversation page |
| `routes/sign/page.tsx`                           | `/sign`                          | Public sign-in page           |
| `routes/login/page.tsx`                          | `/login`                         | Legacy sign-in redirect       |

`routes/layout.tsx` owns application-wide providers and the lazy-route fallback.
`routes/_authenticated/layout.tsx` protects signed-in routes and composes the
persistent application shell. Page modules stay small and compose capabilities
from `src/features`; reusable product state and interactions remain inside their
own feature folders. Shared, domain-neutral components remain under
`src/components`.

The active conversation is derived from the URL. Sidebar navigation changes the
route instead of maintaining a second local conversation identity.

## Interface boundary

- Build the interface exclusively with official shadcn/ui components and the
  underlying Base UI primitives already selected by the shadcn preset.
- Add and update UI components through the shadcn CLI.
- Do not use beUI, its registry, its components, or its motion utilities.
- Keep this application independent from `apps/web`. Do not import or copy its
  components or styles. When behavior must remain compatible, verify the API
  contract and implement it with rebuild-owned shadcn/ui composition.

## Authenticated shell data

The authenticated shell loads `GET /conversations` and `GET /projects` after
the session is established. Sidebar actions use the API contracts for project
creation, rename, delete, pinning, ordering, and moving conversations between
projects and Recents. Deleting a project keeps its conversations and moves them
to Recents.

Starting a new conversation and rendering conversation content are not yet
implemented in this application.

## Adding components

To add components to your app, run the following command:

```bash
npx shadcn@latest add button
```

This places UI components in `src/components/ui`.

## Using components

To use the components in your app, import them as follows:

```tsx
import { Button } from "@/components/ui/button"
```
