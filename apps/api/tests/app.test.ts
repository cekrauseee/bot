import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/app.js'
import { loadSettings } from '../src/config.js'

const settings = loadSettings({ ...process.env, ENVIRONMENT: 'test' })
const services = {
  database: {} as any,
  otp: {
    issue: vi.fn().mockResolvedValue({ challengeId: 'challenge', expiresInSeconds: 600, resendAfterSeconds: 60 }),
    reserve: vi.fn(), finalize: vi.fn(), release: vi.fn(),
  },
  sessions: {
    cookie: vi.fn(() => 'mybot_session=token'),
    clearCookie: vi.fn(() => 'mybot_session=; Max-Age=0'),
    resolve: vi.fn(),
  },
  google: { start: vi.fn().mockResolvedValue({ url: 'https://accounts.google.com/authorize', state: 'state'.repeat(8) }) },
} as any

describe('HTTP contract', () => {
  beforeEach(() => vi.clearAllMocks())

  it('serves only the unprefixed health route', async () => {
    const app = createApp(settings, services)
    expect((await app.handle(new Request('http://localhost/health'))).status).toBe(200)
    expect((await app.handle(new Request('http://localhost/api/health'))).status).toBe(404)
  })

  it('requires exact browser origin for state-changing routes', async () => {
    const app = createApp(settings, services)
    const response = await app.handle(new Request('http://localhost/auth/otp/request', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://evil.test' },
      body: JSON.stringify({ email: 'person@example.com' }),
    }))
    expect(response.status).toBe(403)
    expect(services.otp.issue).not.toHaveBeenCalled()
  })

  it('rejects a missing browser origin in production', async () => {
    const productionSettings = loadSettings({
      ...process.env,
      ENVIRONMENT: 'production',
      WEB_BASE_URL: 'https://app.example.com',
      API_BASE_URL: 'https://api.example.com',
      GOOGLE_REDIRECT_URI: 'https://api.example.com/auth/google/callback',
      SESSION_SECRET: 'session-secret-that-is-at-least-32-characters-long',
      OTP_PEPPER: 'otp-pepper-that-is-at-least-32-characters-long',
      RATE_LIMIT_PEPPER: 'rate-limit-pepper-that-is-at-least-32-characters',
      GOOGLE_CLIENT_ID: 'client.apps.googleusercontent.com',
      GOOGLE_CLIENT_SECRET: 'google-client-secret',
      RESEND_API_KEY: 're_live_valid-key',
    })
    const app = createApp(productionSettings, services)
    const response = await app.handle(new Request('https://api.example.com/auth/otp/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'person@example.com' }),
    }))

    expect(response.status).toBe(403)
    expect(services.otp.issue).not.toHaveBeenCalled()
  })

  it('returns the OTP challenge with 202 and snake case fields', async () => {
    const app = createApp(settings, services)
    const response = await app.handle(new Request('http://localhost/auth/otp/request', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: settings.webOrigin },
      body: JSON.stringify({ email: 'person@example.com' }),
    }))
    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ challenge_id: 'challenge', expires_in_seconds: 600, resend_after_seconds: 60 })
  })

  it('uses Elysia schemas for malformed verification bodies', async () => {
    const app = createApp(settings, services)
    const response = await app.handle(new Request('http://localhost/auth/otp/verify', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: settings.webOrigin },
      body: JSON.stringify({ challenge_id: 'short', code: '12345' }),
    }))
    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({ detail: { code: 'invalid_request', message: 'Invalid request.' } })
  })

  it('documents status-specific request and response schemas', async () => {
    const app = createApp(settings, services)
    const document = await (await app.handle(new Request('http://localhost/openapi/json'))).json() as any
    const verify = document.paths['/auth/otp/verify'].post
    expect(verify.requestBody.content['application/json'].schema.properties.code.pattern).toBe('^\\d{6}$')
    expect(verify.responses['200']).toBeDefined()
    expect(verify.responses['422']).toBeDefined()
  })

  it('returns redirect and state cookie for Google start', async () => {
    const app = createApp(settings, services)
    const response = await app.handle(new Request('http://localhost/auth/google/start'))
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('https://accounts.google.com/authorize')
    expect(response.headers.get('set-cookie')).toContain('mybot_oauth_state=')
  })

  it('clears the OAuth state cookie when Google callback fails', async () => {
    const app = createApp(settings, services)
    const response = await app.handle(new Request('http://localhost/auth/google/callback?error=denied', {
      headers: { cookie: 'mybot_oauth_state=state'.repeat(1) },
    }))
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toContain('/login?error=google')
    expect(response.headers.get('set-cookie')).toContain('mybot_oauth_state=;')
  })

  it('returns a 204 response and clears the session cookie on sign-out', async () => {
    const app = createApp(settings, services)
    const response = await app.handle(new Request('http://localhost/auth/sign-out', { method: 'POST' }))
    expect(response.status).toBe(204)
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0')
  })

  it('returns the AuthError detail for a missing session', async () => {
    services.database.transaction = vi.fn(async (callback: (db: unknown) => Promise<unknown>) => callback({}))
    services.sessions.resolve.mockResolvedValue(undefined)
    const app = createApp(settings, services)
    const response = await app.handle(new Request('http://localhost/auth/session'))
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ detail: { code: 'unauthorized', message: 'Sign in to continue.' } })
  })
})
