import { describe, expect, it } from 'vitest'
import { loadSettings, repositoryEnvPath } from '../src/config.js'
import { databaseDriverFor } from '../src/db/database.js'

const base = { ...process.env, ENVIRONMENT: 'test' }
delete base.CODEX_LOGIN_MODE
delete base.CODEX_HOME_ROOT
delete base.CODEX_BINARY

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
    'ENVIRONMENT',
    'DATABASE_URL',
    'REDIS_URL',
    'WEB_BASE_URL',
    'API_BASE_URL',
    'AI_BASE_URL',
    'SESSION_SECRET',
    'OTP_PEPPER',
    'RATE_LIMIT_PEPPER',
    'AI_SERVICE_TOKEN',
    'GOOGLE_REDIRECT_URI',
    'RESEND_FROM',
  ])('requires the explicit setting %s', (key) => {
    expect(() => loadSettings({ ...base, [key]: '' })).toThrow(new RegExp(`${key} is required`))
  })

  it('rejects non-origin web URLs', () => {
    expect(() => loadSettings({ ...base, WEB_BASE_URL: 'http://localhost:5173/app' })).toThrow()
  })

  it('uses isolated temporary Codex storage outside production and requires absolute configured paths', () => {
    const development = loadSettings({ ...base, ENVIRONMENT: 'development', CODEX_HOME_ROOT: '' })
    expect(development.codexBinary).toBe('codex')
    expect(development.codexLoginMode).toBe('browser')
    expect(development.codexHomeRoot).toContain('my-bot-codex')
    expect(() => loadSettings({ ...base, CODEX_HOME_ROOT: 'relative/codex' }))
      .toThrow(/CODEX_HOME_ROOT/)
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
      AI_SERVICE_TOKEN: 'ai-service-token-that-is-at-least-32-characters',
      GOOGLE_CLIENT_ID: 'client.apps.googleusercontent.com',
      GOOGLE_CLIENT_SECRET: 'google-client-secret',
      RESEND_API_KEY: 're_live_valid-key',
      RESEND_FROM: 'Bot <auth@example.com>',
    }
    expect(loadSettings(production)).toMatchObject({ secureCookies: true, codexHomeRoot: null, codexLoginMode: 'device' })
    expect(loadSettings({ ...production, CODEX_LOGIN_MODE: 'browser' }).codexLoginMode).toBe('browser')
    expect(loadSettings({ ...production, CODEX_HOME_ROOT: '/var/lib/my-bot/codex' }).codexHomeRoot)
      .toBe('/var/lib/my-bot/codex')
    expect(() => loadSettings({ ...production, DATABASE_URL: 'postgresql://user:password@db.example.com/mybot' }))
      .toThrow(/must target a Neon host/)
    expect(() => loadSettings({ ...production, GOOGLE_REDIRECT_URI: 'https://other.example.com/auth/google/callback' })).toThrow()
    expect(() => loadSettings({ ...production, RESEND_FROM: '' })).toThrow()
    expect(() => loadSettings({ ...production, AI_SERVICE_TOKEN: 'replace-with-token' }))
      .toThrow(/AI_SERVICE_TOKEN/)
  })

  it('validates explicit Codex login modes', () => {
    expect(loadSettings({ ...base, CODEX_LOGIN_MODE: 'device' }).codexLoginMode).toBe('device')
    expect(() => loadSettings({ ...base, CODEX_LOGIN_MODE: 'invalid' })).toThrow(/CODEX_LOGIN_MODE/)
  })

  it('validates the optional GitHub encryption key and official MCP endpoint', () => {
    const key = Buffer.alloc(32, 7).toString('base64')
    expect(loadSettings({ ...base, GITHUB_TOKEN_ENCRYPTION_KEY: key }).githubTokenEncryptionKey)
      .toEqual(Buffer.alloc(32, 7))
    expect(() => loadSettings({ ...base, GITHUB_TOKEN_ENCRYPTION_KEY: 'not-a-key' }))
      .toThrow(/GITHUB_TOKEN_ENCRYPTION_KEY/)
    expect(() => loadSettings({ ...base, GITHUB_MCP_URL: 'https://example.com/mcp' }))
      .toThrow(/GITHUB_MCP_URL/)
  })
})
