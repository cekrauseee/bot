# Web application

`apps/web` is the canonical Vite/React browser and desktop renderer. Routes are declared with React Router and page modules are lazy-loaded from `src/routes`; pages compose feature-owned interaction logic.

| Route | Purpose |
| --- | --- |
| `/` | New conversation entry point |
| `/conversations/:conversationId` | Addressable conversation |
| `/sign` | Email, Google, and desktop approval sign-in |
| `/login` | Public login entry |

The interface uses official shadcn components with the selected Base UI primitives, Tailwind semantic tokens, system light/dark appearance, and restrained reduced-motion behavior. Add or update components with the shadcn CLI and keep reusable state inside `src/features`.

Authentication uses API-managed HttpOnly cookies in the browser. In the desktop shell, the main process owns the encrypted session and the renderer receives no secrets. Provider connections and conversation data remain API-owned.
