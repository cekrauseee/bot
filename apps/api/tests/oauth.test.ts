import { describe, expect, it, vi } from 'vitest'
import type { Configuration } from 'openid-client'

vi.mock('openid-client', async () => {
  const actual = await vi.importActual<typeof import('openid-client')>('openid-client')
  return { ...actual, discovery: vi.fn() }
})

import { discovery } from 'openid-client'
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

  it('retries discovery after a rejected discovery promise', async () => {
    const firstError = new Error('discovery unavailable')
    const configuration = {} as Configuration
    vi.mocked(discovery)
      .mockReset()
      .mockRejectedValueOnce(firstError)
      .mockResolvedValueOnce(configuration)
    const service = new GoogleOAuthService({} as never, settings) as any

    await expect(service.config()).rejects.toBe(firstError)
    await expect(service.config()).resolves.toBe(configuration)
    expect(discovery).toHaveBeenCalledTimes(2)
  })
})
