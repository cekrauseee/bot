import type { Settings } from '../../config.js'
import type { AuthRepository } from '../../db/repository.js'
import { generateOpaqueToken, hashSessionToken } from '../../security.js'

export class SessionManager {
  constructor(private readonly settings: Settings) {}

  async issue(repository: AuthRepository, userId: string) {
    const token = generateOpaqueToken()
    const session = await repository.createSession(
      userId,
      hashSessionToken(token),
      new Date(Date.now() + this.settings.sessionTtlSeconds * 1_000),
    )
    return { token, session }
  }

  async resolve(repository: AuthRepository, token?: string) {
    return token ? repository.resolveActiveSession(hashSessionToken(token)) : undefined
  }

  cookie(token: string) {
    return `${this.settings.sessionCookieName}=${encodeURIComponent(token)}; ` +
      `Max-Age=${this.settings.sessionTtlSeconds}; Path=/; HttpOnly; SameSite=Lax` +
      (this.settings.secureCookies ? '; Secure' : '')
  }

  clearCookie() {
    return `${this.settings.sessionCookieName}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax` +
      (this.settings.secureCookies ? '; Secure' : '')
  }
}
