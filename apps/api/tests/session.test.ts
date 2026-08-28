import { describe, expect, it } from 'vitest'
import { loadSettings } from '../src/config.js'
import { SessionManager } from '../src/modules/auth/sessions.js'

describe('session cookies', () => {
  it('uses opaque HttpOnly lax cookies and clears them', () => {
    const sessions = new SessionManager(loadSettings({ ...process.env, ENVIRONMENT: 'test' }))

    expect(sessions.cookie('opaque')).toContain('HttpOnly')
    expect(sessions.cookie('opaque')).toContain('SameSite=Lax')
    expect(sessions.cookie('opaque')).not.toContain('Secure')
    expect(sessions.clearCookie()).toContain('Max-Age=0')
  })

  it('uses a secure __Host cookie in production', () => {
    const settings = loadSettings({
      ...process.env,
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
    })
    const cookie = new SessionManager(settings).cookie('opaque')

    expect(cookie).toContain('__Host-mybot_session=')
    expect(cookie).toContain('Secure')
    expect(cookie).toContain('Path=/')
  })
})
