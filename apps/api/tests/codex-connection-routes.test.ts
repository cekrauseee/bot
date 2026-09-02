import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createApp } from '../src/app.js'
import { loadSettings } from '../src/config.js'

const settings = loadSettings({ ...process.env, ENVIRONMENT: 'test' })
const user = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'person@example.com',
  firstName: 'Person',
  lastName: null,
  avatarUrl: null,
  defaultModel: 'gpt-5.6-sol',
}

const connected = {
  status: 'connected' as const,
  loginMode: 'browser' as const,
  account: { email: user.email, planType: 'plus' },
  limits: {
    primary: {
      usedPercent: 25,
      windowDurationMinutes: 300,
      resetsAt: '2030-03-17T17:46:40.000Z',
    },
    secondary: null,
    reached: false,
  },
}

function services(withCodex = true) {
  const codex = {
    connection: vi.fn().mockResolvedValue(connected),
    startLogin: vi.fn().mockResolvedValue({
      type: 'browser',
      loginId: 'login-1',
      authUrl: 'https://auth.openai.com/codex/login',
    }),
    loginStatus: vi
      .fn()
      .mockResolvedValue({ status: 'connected', connection: connected }),
    cancelLogin: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  }
  return {
    database: {
      transaction: vi.fn(async (callback: (db: unknown) => unknown) =>
        callback({}),
      ),
    },
    otp: {
      issue: vi.fn(),
      reserve: vi.fn(),
      finalize: vi.fn(),
      release: vi.fn(),
    },
    sessions: {
      resolve: vi.fn().mockResolvedValue({ id: 'session-1', user }),
      cookie: vi.fn(),
      clearCookie: vi.fn(),
      issue: vi.fn(),
    },
    google: { start: vi.fn(), callback: vi.fn() },
    agentRuns: {
      startRecoverySweeper: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    },
    ...(withCodex ? { codex } : {}),
  } as any
}

describe('OpenAI Codex provider connection routes', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns connected account metadata and safe rate-limit fields', async () => {
    const app = createApp(settings, services())
    const response = await app.handle(
      new Request('http://localhost/provider-connections/openai-codex'),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({
      status: 'connected',
      login_mode: 'browser',
      account: { email: user.email, plan_type: 'plus' },
      limits: {
        primary: {
          used_percent: 25,
          window_duration_minutes: 300,
          resets_at: '2030-03-17T17:46:40.000Z',
        },
        secondary: null,
        reached: false,
      },
    })
  })

  it('starts and polls an owned browser login without exposing tokens', async () => {
    const dependencies = services()
    const app = createApp(settings, dependencies)
    const start = await app.handle(
      new Request('http://localhost/provider-connections/openai-codex/logins', {
        method: 'POST',
        headers: { origin: settings.webOrigin },
      }),
    )

    expect(start.status).toBe(202)
    expect(start.headers.get('cache-control')).toBe('no-store')
    const payload = await start.json()
    expect(payload).toEqual({
      type: 'browser',
      login_id: 'login-1',
      auth_url: 'https://auth.openai.com/codex/login',
    })
    expect(JSON.stringify(payload)).not.toContain('token')

    const status = await app.handle(
      new Request(
        'http://localhost/provider-connections/openai-codex/logins/login-1',
      ),
    )
    expect(status.status).toBe(200)
    expect(status.headers.get('cache-control')).toBe('no-store')
    expect(await status.json()).toMatchObject({
      status: 'connected',
      connection: { status: 'connected' },
    })
    expect(dependencies.codex.loginStatus).toHaveBeenCalledWith(
      user.id,
      'login-1',
    )
    expect(
      (
        await app.handle(
          new Request(
            'http://localhost/provider-connections/openai-codex/device-code',
            { method: 'POST', headers: { origin: settings.webOrigin } },
          ),
        )
      ).status,
    ).toBe(404)
  })

  it('projects a device-code login without exposing tokens', async () => {
    const deviceConnection = { ...connected, loginMode: 'device' as const }
    const dependencies = services()
    dependencies.codex.connection.mockResolvedValue(deviceConnection)
    dependencies.codex.startLogin.mockResolvedValue({
      type: 'device_code',
      loginId: 'login-device-1',
      verificationUrl: 'https://auth.openai.com/codex/device',
      userCode: 'ABCD-EFGH',
    })
    const app = createApp({ ...settings, codexLoginMode: 'device' }, dependencies)

    const start = await app.handle(
      new Request('http://localhost/provider-connections/openai-codex/logins', {
        method: 'POST',
        headers: { origin: settings.webOrigin },
      }),
    )

    expect(start.status).toBe(202)
    const payload = await start.json()
    expect(payload).toEqual({
      type: 'device_code',
      login_id: 'login-device-1',
      verification_url: 'https://auth.openai.com/codex/device',
      user_code: 'ABCD-EFGH',
    })
    expect(JSON.stringify(payload)).not.toContain('token')

    const connection = await app.handle(
      new Request('http://localhost/provider-connections/openai-codex'),
    )
    expect(connection.status).toBe(200)
    expect((await connection.json()).login_mode).toBe('device')
  })

  it('protects mutations by origin and disconnects the authenticated user', async () => {
    const dependencies = services()
    const app = createApp(settings, dependencies)
    const rejected = await app.handle(
      new Request('http://localhost/provider-connections/openai-codex', {
        method: 'DELETE',
        headers: { origin: 'http://evil.example' },
      }),
    )
    expect(rejected.status).toBe(403)

    const disconnected = await app.handle(
      new Request('http://localhost/provider-connections/openai-codex', {
        method: 'DELETE',
        headers: { origin: settings.webOrigin },
      }),
    )
    expect(disconnected.status).toBe(204)
    expect(dependencies.codex.disconnect).toHaveBeenCalledWith(user.id)
  })

  it('fails closed when the Codex runtime is not configured', async () => {
    const app = createApp(settings, services(false))
    const status = await app.handle(
      new Request('http://localhost/provider-connections/openai-codex'),
    )
    expect(await status.json()).toEqual({
      status: 'unavailable',
      login_mode: 'browser',
      account: null,
      limits: null,
    })

    const start = await app.handle(
      new Request('http://localhost/provider-connections/openai-codex/logins', {
        method: 'POST',
        headers: { origin: settings.webOrigin },
      }),
    )
    expect(start.status).toBe(503)
    expect(await start.json()).toEqual({
      detail: {
        code: 'codex_unavailable',
        message: 'OpenAI connection is not configured on this server.',
      },
    })
  })
})
