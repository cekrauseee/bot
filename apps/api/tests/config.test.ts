import { describe, expect, it } from 'vitest'
import { loadSettings, repositoryEnvPath } from '../src/config.js'

const base = { ...process.env, ENVIRONMENT: 'test' }

describe('configuration', () => {
  it('resolves the repository .env next to the module and lets explicit values win', () => {
    expect(repositoryEnvPath.endsWith('/.env') || repositoryEnvPath.endsWith('\\.env')).toBe(true)
    expect(loadSettings({ ...base, DATABASE_URL: 'postgresql://explicit.example/db' }).databaseUrl)
      .toBe('postgresql://explicit.example/db')
  })

  it('normalizes legacy postgres URLs and validates Redis URLs', () => {
    expect(loadSettings({ ...base, DATABASE_URL: 'postgresql+psycopg://x' }).databaseUrl).toBe('postgresql://x')
    expect(() => loadSettings({ ...base, REDIS_URL: 'http://localhost:6380' })).toThrow()
  })

  it('rejects CIDR proxy entries and non-origin web URLs', () => {
    expect(() => loadSettings({ ...base, TRUSTED_PROXY_HOSTS: '10.0.0.0/8' })).toThrow()
    expect(() => loadSettings({ ...base, WEB_BASE_URL: 'http://localhost:5173/app' })).toThrow()
  })

  it('requires complete HTTPS production guardrails', () => {
    const production = {
      ...base,
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
      RESEND_FROM: 'myBot <auth@example.com>',
    }
    expect(loadSettings(production).secureCookies).toBe(true)
    expect(() => loadSettings({ ...production, GOOGLE_REDIRECT_URI: 'https://other.example.com/auth/google/callback' })).toThrow()
    expect(() => loadSettings({ ...production, RESEND_FROM: '' })).toThrow()
  })
})
