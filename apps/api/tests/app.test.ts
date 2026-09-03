import { beforeEach, describe, expect, it, vi } from 'vitest'
import net from 'node:net'
import { createApp } from '../src/app.js'
import { loadSettings } from '../src/config.js'
import { signValue } from '../src/security.js'

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
  google: {
    start: vi.fn().mockResolvedValue({ url: 'https://accounts.google.com/authorize', state: 'state'.repeat(8) }),
    callback: vi.fn(),
  },
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

  it('allows the stable desktop renderer origin through CORS in every environment', async () => {
    for (const environment of ['development', 'test', 'production'] as const) {
      const app = createApp({ ...settings, environment }, services)
      const response = await app.handle(new Request('http://localhost/projects', {
        method: 'OPTIONS',
        headers: {
          origin: 'app://mybot',
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'authorization,content-type',
        },
      }))
      expect(response.headers.get('access-control-allow-origin')).toBe('app://mybot')
      expect(response.headers.get('access-control-allow-credentials')).toBe('true')
      expect(response.headers.get('access-control-allow-headers')).toContain('Authorization')
    }
  })

  it('keeps OTP authentication browser-only', async () => {
    const app = createApp(settings, services)
    const response = await app.handle(new Request('http://localhost/auth/otp/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'app://mybot' },
      body: JSON.stringify({ email: 'person@example.com' }),
    }))
    expect(response.status).toBe(403)
    expect(services.otp.issue).not.toHaveBeenCalled()
  })

  it('rejects a missing browser origin in production', async () => {
    const productionSettings = loadSettings({
      ...process.env,
      ENVIRONMENT: 'production',
      DATABASE_URL: 'postgresql://user:password@ep-test.us-east-1.aws.neon.tech/mybot',
      WEB_BASE_URL: 'https://app.example.com',
      API_BASE_URL: 'https://api.example.com',
      GOOGLE_REDIRECT_URI: 'https://api.example.com/auth/google/callback',
      SESSION_SECRET: 'session-secret-that-is-at-least-32-characters-long',
      OTP_PEPPER: 'otp-pepper-that-is-at-least-32-characters-long',
      RATE_LIMIT_PEPPER: 'rate-limit-pepper-that-is-at-least-32-characters',
      AI_SERVICE_TOKEN: 'ai-service-token-that-is-at-least-32-characters',
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

  it.each(['development', 'test', 'production'] as const)(
    'only exposes an OTP in a non-cacheable development response: %s', async (environment) => {
      services.otp.issue.mockResolvedValueOnce({
        challengeId: 'challenge', expiresInSeconds: 600, resendAfterSeconds: 60,
        developmentCode: '123456',
      })
      const app = createApp({ ...settings, environment }, services)
      const response = await app.handle(new Request('http://localhost/auth/otp/request', {
        method: 'POST', headers: { 'content-type': 'application/json', origin: settings.webOrigin },
        body: JSON.stringify({ email: 'developer@example.com' }),
      }))
      expect(response.status).toBe(202)
      expect(response.headers.get('cache-control')).toBe('no-store')
      const body = await response.json()
      if (environment === 'development') expect(body.development_code).toBe('123456')
      else expect(body).not.toHaveProperty('development_code')
    },
  )

  it('preserves FastAPI validation semantics for representative auth bodies', async () => {
    const controlBody = '{"a":"bad' + String.fromCharCode(1) + '"}'
    const cases = [
      {
        path: '/auth/otp/request', body: JSON.stringify({ email: 'not-an-email' }),
        detail: [{ loc: ['body', 'email'], msg: 'value is not a valid email address: An email address must have an @-sign.', type: 'value_error', input: 'not-an-email', ctx: { reason: 'An email address must have an @-sign.' } }],
      },
      {
        path: '/auth/otp/verify', body: JSON.stringify({ challenge_id: 'short', code: '12345' }),
        detail: [
          { loc: ['body', 'challenge_id'], msg: 'String should have at least 32 characters', type: 'string_too_short', input: 'short', ctx: { min_length: 32 } },
          { loc: ['body', 'code'], msg: "String should match pattern '^\\d{6}$'", type: 'string_pattern_mismatch', input: '12345', ctx: { pattern: '^\\d{6}$' } },
        ],
      },
      {
        path: '/auth/otp/verify', body: JSON.stringify({ challenge_id: 'x'.repeat(129), code: '123456' }),
        detail: [{ loc: ['body', 'challenge_id'], msg: 'String should have at most 128 characters', type: 'string_too_long', input: 'x'.repeat(129), ctx: { max_length: 128 } }],
      },
      {
        path: '/auth/otp/verify', body: JSON.stringify({ challenge_id: 'x'.repeat(32), code: '12345a' }),
        detail: [{ loc: ['body', 'code'], msg: "String should match pattern '^\\d{6}$'", type: 'string_pattern_mismatch', input: '12345a', ctx: { pattern: '^\\d{6}$' } }],
      },
      {
        path: '/auth/otp/verify', body: JSON.stringify({}),
        detail: [
          { loc: ['body', 'challenge_id'], msg: 'Field required', type: 'missing', input: {} },
          { loc: ['body', 'code'], msg: 'Field required', type: 'missing', input: {} },
        ],
      },
      {
        path: '/auth/otp/verify', body: JSON.stringify({ challenge_id: 123, code: 123456 }),
        detail: [
          { loc: ['body', 'challenge_id'], msg: 'Input should be a valid string', type: 'string_type', input: 123 },
          { loc: ['body', 'code'], msg: 'Input should be a valid string', type: 'string_type', input: 123456 },
        ],
      },
      {
        path: '/auth/otp/verify', body: '[1,]',
        detail: [{ loc: ['body', 2], msg: 'JSON decode error', type: 'json_invalid', input: {}, ctx: { error: 'Illegal trailing comma before end of array' } }],
      },
      {
        path: '/auth/otp/verify', body: '{}{} ',
        detail: [{ loc: ['body', 2], msg: 'JSON decode error', type: 'json_invalid', input: {}, ctx: { error: 'Extra data' } }],
      },
      {
        path: '/auth/otp/verify', body: 'tru',
        detail: [{ loc: ['body', 0], msg: 'JSON decode error', type: 'json_invalid', input: {}, ctx: { error: 'Expecting value' } }],
      },
      {
        path: '/auth/otp/verify', body: '{"a":"',
        detail: [{ loc: ['body', 5], msg: 'JSON decode error', type: 'json_invalid', input: {}, ctx: { error: 'Unterminated string starting at' } }],
      },
      {
        path: '/auth/otp/verify', body: '[1',
        detail: [{ loc: ['body', 2], msg: 'JSON decode error', type: 'json_invalid', input: {}, ctx: { error: "Expecting ',' delimiter" } }],
      },
      {
        path: '/auth/otp/verify', body: '1e',
        detail: [{ loc: ['body', 1], msg: 'JSON decode error', type: 'json_invalid', input: {}, ctx: { error: 'Extra data' } }],
      },
      {
        path: '/auth/otp/verify', body: '{"a":"\\x"}',
        detail: [{ loc: ['body', 6], msg: 'JSON decode error', type: 'json_invalid', input: {}, ctx: { error: 'Invalid \\escape' } }],
      },
      {
        path: '/auth/otp/verify', body: controlBody,
        detail: [{ loc: ['body', 9], msg: 'JSON decode error', type: 'json_invalid', input: {}, ctx: { error: 'Invalid control character at' } }],
      },
      {
        path: '/auth/otp/verify', body: '{"a":"bad\\u12"}',
        detail: [{ loc: ['body', 10], msg: 'JSON decode error', type: 'json_invalid', input: {}, ctx: { error: 'Invalid \\uXXXX escape' } }],
      },
      {
        path: '/auth/otp/verify', body: '{"a":1,,}',
        detail: [{ loc: ['body', 7], msg: 'JSON decode error', type: 'json_invalid', input: {}, ctx: { error: 'Expecting property name enclosed in double quotes' } }],
      },
    ]
    for (const testCase of cases) {
      const app = createApp(settings, services)
      const response = await app.handle(new Request(`http://localhost${testCase.path}`, {
        method: 'POST', headers: { 'content-type': 'application/json', origin: settings.webOrigin }, body: testCase.body,
      }))
      expect(response.status).toBe(422)
      expect(await response.json()).toEqual({ detail: testCase.detail })
    }

    const malformedCases = [
      { body: '{', offset: 1, error: 'Expecting property name enclosed in double quotes' },
      { body: '{"challenge_id":', offset: 16, error: 'Expecting value' },
      { body: '{"challenge_id":"super-secret-token"', offset: 36, error: "Expecting ',' delimiter" },
      { body: '{"challenge_id":"abc",}', offset: 21, error: 'Illegal trailing comma before end of object' },
    ]
    for (const testCase of malformedCases) {
      const app = createApp(settings, services)
      const malformed = await app.handle(new Request('http://localhost/auth/otp/verify', {
        method: 'POST', headers: { 'content-type': 'application/json', origin: settings.webOrigin }, body: testCase.body,
      }))
      expect(malformed.status).toBe(422)
      const serialized = await malformed.text()
      expect(serialized).not.toContain('super-secret-token')
      expect(JSON.parse(serialized)).toEqual({
        detail: [{ loc: ['body', testCase.offset], msg: 'JSON decode error', type: 'json_invalid', input: {}, ctx: { error: testCase.error } }],
      })
    }
  })

  it('documents status-specific request and response schemas', async () => {
    const app = createApp(settings, services)
    const document = await (await app.handle(new Request('http://localhost/openapi/json'))).json() as any
    const verify = document.paths['/auth/otp/verify'].post
    expect(verify.requestBody.content['application/json'].schema.properties.code.pattern).toBe('^\\d{6}$')
    expect(verify.responses['200']).toBeDefined()
    expect(verify.responses['422']).toBeDefined()
    expect(document.paths['/conversations']).toBeDefined()
    expect(document.paths['/conversations/{conversationId}']).toBeDefined()
    const turn = document.paths['/conversations/{conversationId}/turns'].post
    expect(turn.requestBody.content['application/json'].schema.properties.model.enum)
      .toEqual([
        'gpt-5.6-sol',
        'gpt-5.6-terra',
        'gpt-5.6-luna',
      ])
  })

  it('returns redirect and state cookie for Google start', async () => {
    const app = createApp(settings, services)
    const response = await app.handle(new Request('http://localhost/auth/google/start'))
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('https://accounts.google.com/authorize')
    expect(response.headers.get('set-cookie')).toContain('mybot_oauth_state=')
  })

  it('completes an authenticated desktop handoff with a validated deep link', async () => {
    const transactionId = 't'.repeat(32)
    const desktopServices = {
      ...services,
      database: {
        transaction: vi.fn(async (callback: (db: unknown) => Promise<unknown>) => callback({})),
      },
      sessions: {
        ...services.sessions,
        resolve: vi.fn().mockResolvedValue({ id: 'session_123', user: { id: 'user_123' } }),
      },
      desktopAuth: {
        complete: vi.fn().mockResolvedValue({
          callbackUrl: `mybot://auth/callback?transaction_id=${transactionId}`,
        }),
      },
    }
    const app = createApp(settings, desktopServices as any)
    const response = await app.handle(new Request('http://localhost/auth/desktop/complete', {
      method: 'POST',
      headers: {
        cookie: `${settings.sessionCookieName}=browser-session`,
        origin: settings.webOrigin,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ transaction_id: transactionId }),
    }))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({
      callback_url: `mybot://auth/callback?transaction_id=${transactionId}`,
    })
    expect(desktopServices.desktopAuth.complete).toHaveBeenCalledWith(transactionId, 'user_123')
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

  it('emits both Google callback cookies through the Node listener', async () => {
    services.google.callback.mockResolvedValue({
      subject: 'google-subject',
      email: 'person@example.com',
      firstName: 'Person',
      lastName: null,
      avatarUrl: null,
    })
    services.database.transaction = vi.fn().mockResolvedValue({ token: 'session-token' })
    services.sessions.cookie.mockReturnValue('mybot_session=session-token')
    const app = createApp(settings, services)
    const server = await new Promise<any>((resolve) => app.listen({ port: 0, hostname: '127.0.0.1' }, resolve))
    try {
      const nodeServer = server.node.server
      if (!nodeServer.listening) await new Promise((resolve: (value?: unknown) => void) => nodeServer.once('listening', resolve))
      const address = nodeServer.address() as { port: number }
      const response = await fetch(`http://127.0.0.1:${address.port}/auth/google/callback?state=state&code=code`, {
        headers: { cookie: `mybot_oauth_state=${encodeURIComponent(signValue('state', settings.sessionSecret))}` },
        redirect: 'manual',
      })

      expect(response.status).toBe(303)
      expect(response.headers.get('location')).toBe(`${settings.webOrigin}/`)
      expect(response.headers.getSetCookie()).toEqual([
        'mybot_session=session-token',
        'mybot_oauth_state=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax',
        'mybot_desktop_transaction=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax',
      ])
    } finally {
      await server.stop()
    }
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

  it('survives an aborted WebSocket upgrade while authentication is pending', async () => {
    const dependencies = {
      ...services,
      database: {
        transaction: vi.fn(async (callback: (db: unknown) => Promise<unknown>) => callback({})),
      },
      sessions: {
        ...services.sessions,
        resolve: vi.fn(async () => {
          await new Promise((resolve) => setTimeout(resolve, 50))
          return undefined
        }),
      },
    }
    const app = createApp(settings, dependencies as any)
    const server = await new Promise<any>((resolve) => app.listen({ port: 0, hostname: '127.0.0.1' }, resolve))
    try {
      const nodeServer = server.node.server
      if (!nodeServer.listening) await new Promise((resolve: (value?: unknown) => void) => nodeServer.once('listening', resolve))
      const address = nodeServer.address() as { port: number }
      const socket = net.connect(address.port, '127.0.0.1', () => {
        socket.write([
          'GET /agent-runs/subscribe HTTP/1.1',
          `Host: 127.0.0.1:${address.port}`,
          'Connection: Upgrade',
          'Upgrade: websocket',
          'Sec-WebSocket-Version: 13',
          'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
          `Origin: ${settings.webOrigin}`,
          '',
          '',
        ].join('\r\n'))
        setTimeout(() => socket.destroy(), 10)
      })
      socket.on('error', () => undefined)

      await new Promise((resolve) => setTimeout(resolve, 100))
      const health = await fetch(`http://127.0.0.1:${address.port}/health`)
      expect(health.status).toBe(200)
    } finally {
      await server.stop()
    }
  })
})
