# Bot transactional email

`emails/login-otp.tsx` is the React Email component and single source of truth for the OTP message. The package exports the typed component and subject through `@my-bot/email`; the API does not use hosted Resend templates.

## Local preview and build

From the repository root:

```sh
npm run email:dev
npm run email:typecheck
npm run email:build
```

The preview uses code `482913` and a 10-minute expiry. `email:build` compiles the workspace package consumed by the Node API. Build the email package before the API package in production; the compiled package has no dependency on the React Email CLI.

## Delivery

The Node.js/Elysia application API passes the repository-owned React Email element, with the server-generated code and expiry props, to the Resend Node SDK `react` field. Resend renders the component in Node; the API does not send generated `html` or `text` artifacts, and requires only `RESEND_API_KEY` and `RESEND_FROM`.
