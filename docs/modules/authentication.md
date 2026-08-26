# Authentication

## Methods

Email login creates or reuses a user only after a valid one-time code. Google login uses OpenID Connect and links a verified Google email to the same user record. Later Google logins resolve the provider subject before considering the current email claim.

The API requests only `openid email profile`. It stores the Google subject, provider email, first name, last name, and avatar URL. It does not store Google access or refresh tokens.

## HTTP Contract

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/auth/otp/request` | Issue and email a new challenge |
| `POST` | `/auth/otp/verify` | Consume a code and create a session |
| `GET` | `/auth/google/start` | Start Google Authorization Code login |
| `GET` | `/auth/google/callback` | Validate Google state, nonce, PKCE, and identity |
| `GET` | `/auth/session` | Return the current user or HTTP 401 |
| `POST` | `/auth/sign-out` | Revoke the current session and clear its cookie |

OTP request responses are identical for new and existing email addresses. Errors use `detail.code`, `detail.message`, and an optional `detail.retry_after_seconds`. Rate-limited responses also set `Retry-After`.

## Security Properties

- Codes contain six cryptographically random decimal digits, expire after 10 minutes, and work once.
- Redis stores the code HMAC, challenge email, attempt count, and expiry. It never stores the raw code.
- A challenge locks after five incorrect codes. Request and verification limits apply to keyed email and IP identifiers.
- Resending waits 60 seconds, creates a new code, and invalidates the previous challenge.
- Session tokens are opaque random values. PostgreSQL stores only their SHA-256 hashes.
- Sessions last 30 days, support multiple devices, and can be revoked individually or by user.
- Production cookies are host-only, `Secure`, `HttpOnly`, `SameSite=Lax`, and use the `__Host-` prefix.
- Credentialed CORS uses one configured web origin. Production state-changing requests require the same `Origin`.

## Email Template

`apps/emails/emails/login-otp.tsx` is the versioned React Email source. Publish it in Resend with alias `mybot-login-otp`, subject `Your myBOT sign-in code`, and variables `OTP_CODE` and `EXPIRATION_MINUTES`. The API sends from `RESEND_FROM`; production uses `myBOT <hello@mybot.cekrause.eu>`.

## Production Topology

Configure the web and API as sibling HTTPS subdomains. Register the exact API callback URI in the Google OAuth client. Configure the serving proxy to pass only trusted forwarded client addresses so IP rate limits use the original client rather than a shared proxy address.
