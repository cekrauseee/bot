import type { Redis } from 'ioredis'
import {
  authorizationCodeGrant,
  buildAuthorizationUrl,
  calculatePKCECodeChallenge,
  discovery,
  randomNonce,
  randomPKCECodeVerifier,
  randomState,
  type Configuration,
} from 'openid-client'
import type { Settings } from '../../config.js'
import { AuthError } from '../../errors.js'

export const GOOGLE_ISSUER = 'https://accounts.google.com'
const STATE_TTL_SECONDS = 600

export type GoogleProfile = {
  subject: string
  email: string
  firstName: string | null
  lastName: string | null
  avatarUrl: string | null
}

export class GoogleOAuthService {
  private configuration?: Promise<Configuration>

  constructor(private readonly redis: Redis, private readonly settings: Settings) {}

  get configured() {
    return Boolean(this.settings.googleClientId && this.settings.googleClientSecret)
  }

  private async config() {
    this.configuration ??= discovery(
      new URL(GOOGLE_ISSUER),
      this.settings.googleClientId,
      this.settings.googleClientSecret,
    )
    return this.configuration
  }

  async start() {
    if (!this.configured) {
      throw new AuthError('google_auth_unavailable', 'Google sign-in is not configured.', 503)
    }
    const state = randomState()
    const nonce = randomNonce()
    const verifier = randomPKCECodeVerifier()
    const challenge = await calculatePKCECodeChallenge(verifier)
    await this.redis.set(
      `auth:oauth:state:${state}`,
      JSON.stringify({ nonce, verifier }),
      'EX',
      STATE_TTL_SECONDS,
    )
    const url = buildAuthorizationUrl(await this.config(), {
      redirect_uri: this.settings.googleRedirectUri,
      scope: 'openid email profile',
      state,
      nonce,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      prompt: 'select_account',
    })
    return { url: url.toString(), state }
  }

  async callback(query: Record<string, string | undefined>, cookieState?: string): Promise<GoogleProfile> {
    if (!this.configured) {
      throw new AuthError('google_auth_unavailable', 'Google sign-in is not configured.', 503)
    }
    const state = query.state
    if (!state || !cookieState || state !== cookieState) throw this.failed()

    try {
      const raw = await this.redis.getdel(`auth:oauth:state:${state}`)
      if (!raw) throw this.failed()
      const saved = JSON.parse(raw) as { nonce?: unknown; verifier?: unknown }
      if (typeof saved.nonce !== 'string' || typeof saved.verifier !== 'string') throw this.failed()
      const callbackUrl = new URL(this.settings.googleRedirectUri)
      callbackUrl.search = new URLSearchParams(
        Object.entries(query).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
      ).toString()
      const result = await authorizationCodeGrant(await this.config(), callbackUrl, {
        pkceCodeVerifier: saved.verifier,
        expectedState: state,
        expectedNonce: saved.nonce,
      })
      const claims = result.claims() as Record<string, unknown> | undefined
      if (!claims || !this.validClaims(claims)) throw this.failed()
      return {
        subject: claims.sub as string,
        email: claims.email as string,
        firstName: this.optionalString(claims.given_name),
        lastName: this.optionalString(claims.family_name),
        avatarUrl: this.optionalString(claims.picture),
      }
    } catch (error) {
      if (error instanceof AuthError) throw error
      throw this.failed()
    }
  }

  private validClaims(claims: Record<string, unknown> | undefined) {
    if (!claims || claims.iss !== GOOGLE_ISSUER || claims.email_verified !== true) return false
    const audience = claims.aud
    const audienceMatches = typeof audience === 'string'
      ? audience === this.settings.googleClientId
      : Array.isArray(audience) && audience.some((value) => value === this.settings.googleClientId)
    return audienceMatches && typeof claims.sub === 'string' && claims.sub.length > 0 &&
      typeof claims.email === 'string' && claims.email.length > 0
  }

  private failed() {
    return new AuthError('google_auth_failed', 'Unable to sign in with Google. Try again.', 400)
  }

  private optionalString(value: unknown) {
    return typeof value === 'string' && value.length > 0 ? value : null
  }
}
