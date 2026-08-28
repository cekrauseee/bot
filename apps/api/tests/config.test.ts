import { describe, expect, it } from 'vitest'
import { loadSettings, repositoryEnvPath } from '../src/config.js'
import { databaseDriverFor } from '../src/db/database.js'

const base = { ...process.env, ENVIRONMENT: 'test' }

describe('configuration', () => {
  it('selects Neon only for production and node-postgres otherwise', () => {
    expect(databaseDriverFor('production')).toBe('neon')
    expect(databaseDriverFor('development')).toBe('node-postgres')
    expect(databaseDriverFor('test')).toBe('node-postgres')
  })

  it('resolves the repository .env next to the module and lets explicit values win', () => {
    expect(repositoryEnvPath.endsWith('/.env') || repositoryEnvPath.endsWith('\\.env')).toBe(true)
    expect(loadSettings({ ...base, DATABASE_URL: 'postgresql://explicit.example/db' }).databaseUrl)
      .toBe('postgresql://explicit.example/db')
  })

  it('normalizes the legacy Python PostgreSQL URL and rejects unrelated drivers', () => {
    expect(loadSettings({ ...base, DATABASE_URL: 'postgresql+psycopg://user:password@localhost/mybot' }).databaseUrl)
      .toBe('postgresql://user:password@localhost/mybot')
    expect(() => loadSettings({ ...base, DATABASE_URL: 'mysql://user:password@localhost/mybot' })).toThrow()
    expect(() => loadSettings({ ...base, REDIS_URL: 'http://localhost:6380' })).toThrow()
  })

  it.each([
    'my-wsproxy.example.com',
    'my-wsproxy.example.com:443',
    'my-wsproxy.example.com/v1',
    'my-wsproxy.example.com:8443/v1/neon',
    '127.0.0.1:8080/proxy',
  ])('accepts the Neon WebSocket proxy address %s', (proxy) => {
    expect(loadSettings({ ...base, NEON_WS_PROXY: proxy }).neonWsProxy).toBe(proxy)
  })

  it.each([
    'https://proxy.example.com',
    'user:password@proxy.example.com',
    'proxy.example.com?address=neon',
    'proxy.example.com#fragment',
    '-proxy.example.com',
    'proxy..example.com',
    'proxy.example.com:0',
    'proxy.example.com:65536',
    'proxy.example.com:abc',
    'proxy.example.com/',
    'proxy.example.com/v 1',
  ])('rejects an invalid Neon WebSocket proxy address %s', (proxy) => {
    expect(() => loadSettings({ ...base, NEON_WS_PROXY: proxy })).toThrow(/NEON_WS_PROXY/)
  })

  it('rejects CIDR proxy entries and non-origin web URLs', () => {
    expect(() => loadSettings({ ...base, TRUSTED_PROXY_HOSTS: '10.0.0.0/8' })).toThrow()
    expect(() => loadSettings({ ...base, WEB_BASE_URL: 'http://localhost:5173/app' })).toThrow()
  })

  it('requires complete HTTPS production guardrails', () => {
    const production = {
      ...base,
      ENVIRONMENT: 'production',
      DATABASE_URL: 'postgresql://user:password@ep-test.us-east-1.aws.neon.tech/mybot',
      WEB_BASE_URL: 'https://app.example.com',
      API_BASE_URL: 'https://api.example.com',
      GOOGLE_REDIRECT_URI: 'https://api.example.com/auth/google/callback',
      SESSION_SECRET: 'session-secret-that-is-at-least-32-characters-long',
      OTP_PEPPER: 'otp-pepper-that-is-at-least-32-characters-long',
      RATE_LIMIT_PEPPER: 'rate-limit-pepper-that-is-at-least-32-characters',
      GOOGLE_CLIENT_ID: 'client.apps.googleusercontent.com',
      GOOGLE_CLIENT_SECRET: 'google-client-secret',
      RESEND_API_KEY: 're_live_valid-key',
      RESEND_FROM: 'myBot <auth@example.com>',
    }
    expect(loadSettings(production).secureCookies).toBe(true)
    expect(() => loadSettings({ ...production, DATABASE_URL: 'postgresql://user:password@db.example.com/mybot' }))
      .toThrow(/must target a Neon host/)
    expect(loadSettings({ ...production, DATABASE_URL: 'postgresql://user:password@db.example.com/mybot', NEON_WS_PROXY: 'proxy.example.com' }).neonWsProxy)
      .toBe('proxy.example.com')
    expect(() => loadSettings({ ...production, GOOGLE_REDIRECT_URI: 'https://other.example.com/auth/google/callback' })).toThrow()
    expect(() => loadSettings({ ...production, RESEND_FROM: '' })).toThrow()
  })
})
