import { describe, expect, it } from 'vitest'
import { GoogleOAuthService } from '../src/modules/auth/oauth.js'
import { loadSettings } from '../src/config.js'

const settings = loadSettings({
  ...process.env,
  ENVIRONMENT: 'test',
  GOOGLE_CLIENT_ID: 'client.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'google-client-secret',
})

describe('Google claim validation', () => {
  it('accepts a client ID in an audience array and requires verified identity claims', () => {
    const service = new GoogleOAuthService({} as never, settings) as any
    expect(service.validClaims({
      iss: 'https://accounts.google.com',
      aud: ['another-client', settings.googleClientId],
      email_verified: true,
      sub: 'google-subject',
      email: 'person@example.com',
    })).toBe(true)
    expect(service.validClaims({
      iss: 'https://accounts.google.com', aud: settings.googleClientId,
      email_verified: false, sub: 'google-subject', email: 'person@example.com',
    })).toBe(false)
  })

  it('rejects wrong issuer, audience, and incomplete subject/email', () => {
    const service = new GoogleOAuthService({} as never, settings) as any
    for (const claims of [
      { iss: 'https://evil.example', aud: settings.googleClientId, email_verified: true, sub: 's', email: 'a@b.com' },
      { iss: 'https://accounts.google.com', aud: 'wrong', email_verified: true, sub: 's', email: 'a@b.com' },
      { iss: 'https://accounts.google.com', aud: settings.googleClientId, email_verified: true, sub: '', email: 'a@b.com' },
      { iss: 'https://accounts.google.com', aud: settings.googleClientId, email_verified: true, sub: 's', email: '' },
    ]) expect(service.validClaims(claims)).toBe(false)
  })
})
