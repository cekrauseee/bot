# Authentication

## Browser login

Email login issues a six-digit OTP, stores only its hash and challenge metadata in Redis, and consumes it once. Google login uses Authorization Code, PKCE, state, and nonce; only the verified profile and identity link are stored. Browser sessions are opaque tokens whose hashes are stored in PostgreSQL and whose raw values are held in HttpOnly cookies.

State-changing browser requests require the configured web origin (or the desktop app origin for authenticated app routes). Bearer authentication is accepted only by routes that resolve that bearer session; a syntactically valid fake bearer does not bypass origin checks.

## Desktop handoff

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/auth/desktop/start` | Create a short-lived transaction and return its one-time secret to the desktop main process |
| `POST` | `/auth/desktop/complete` | Authenticated browser action that records the `user_id` and returns the desktop callback URL |
| `POST` | `/auth/desktop/exchange` | One-time exchange that issues a new desktop session for that user |

The client secret appears only in the desktop main process and exchange request body. Redis stores its hash, transaction status, and authenticated user ID; it never stores a browser session token. After Google establishes the browser session, the API callback completes the desktop transaction and redirects directly to a validated `mybot://auth/callback` deep link. OTP and an already-authenticated browser complete the same transaction through the web application. The callback contains only the public transaction ID. The newly issued desktop session can be signed out without revoking the browser session that created it.

## Desktop storage

Electron stores the pending client secret and desktop session with `safeStorage` under the user-data directory. Renderer code receives neither value. The main process validates the deep link against the pending transaction, exchanges the secret once, and adds the resulting bearer token only for the exact configured API origin.
