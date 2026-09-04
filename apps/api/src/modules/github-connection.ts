import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import type { Redis } from 'ioredis'
import type { Settings } from '../config.js'
import type { Database } from '../db/database.js'
import { GithubConnectionRepository } from '../db/repository.js'
import {
  ProviderConnectionError,
  type ProviderConnection,
  type ProviderConnectionAdapter,
  type ProviderLogin,
  type ProviderLoginStatus,
} from './provider-connections.js'

const STATE_TTL = 600
const AUTHORIZATION_URL = 'https://github.com/login/oauth/authorize'
const TOKEN_URL = 'https://github.com/login/oauth/access_token'
const USER_URL = 'https://api.github.com/user'
// GitHub OAuth Apps expose `repo` as the minimum scope that can read private
// repository contents; write-capable MCP tools remain disallowed below.
export const GITHUB_OAUTH_SCOPE = 'repo'
const jsonHeaders = { accept: 'application/json', 'user-agent': 'myBot' }

type PendingLogin = { userId: string; loginId: string; verifier: string; state?: string; phase?: 'pending' | 'completing' }
type TokenEnvelope = { v: 1; iv: string; tag: string; data: string }

export class GithubConnectionError extends ProviderConnectionError {
  constructor(readonly code: 'github_unavailable' | 'github_already_connected' | 'github_login_not_found' | 'github_auth_failed', message: string, status: number) {
    super(code, message, status)
    this.name = 'GithubConnectionError'
  }
}

const safeFailure = () => new GithubConnectionError('github_auth_failed', 'Unable to connect GitHub. Try again.', 400)

export function encryptGithubToken(value: string, key: Buffer): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return JSON.stringify({ v: 1, iv: iv.toString('base64url'), tag: cipher.getAuthTag().toString('base64url'), data: data.toString('base64url') })
}

export function decryptGithubToken(value: string, key: Buffer): string {
  let envelope: TokenEnvelope
  try { envelope = JSON.parse(value) as TokenEnvelope } catch { throw new Error('invalid encrypted GitHub token') }
  if (envelope.v !== 1) throw new Error('unsupported encrypted GitHub token')
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(envelope.data, 'base64url')), decipher.final()]).toString('utf8')
}

export class GithubConnectionService implements ProviderConnectionAdapter {
  readonly configured: boolean
  private readonly refreshes = new Map<string, Promise<string | undefined>>()

  constructor(private readonly database: Database, private readonly redis: Redis, private readonly settings: Settings) {
    this.configured = Boolean(settings.githubClientId && settings.githubClientSecret && settings.githubTokenEncryptionKey)
  }

  async connection(userId: string): Promise<ProviderConnection> {
    if (!this.configured) return this.unavailable()
    const row = await this.database.transaction((db) => new GithubConnectionRepository(db).get(userId))
    if (!row) return { status: 'disconnected', loginMode: 'browser', account: null, limits: null }
    return { status: 'connected', loginMode: 'browser', account: { email: row.email, planType: row.login }, limits: null }
  }

  async startLogin(userId: string): Promise<ProviderLogin> {
    if (!this.configured) throw new GithubConnectionError('github_unavailable', 'GitHub connection is not configured.', 503)
    if ((await this.connection(userId)).status === 'connected') throw new GithubConnectionError('github_already_connected', 'A GitHub account is already connected.', 409)
    const loginId = randomBytes(24).toString('base64url')
    const state = randomBytes(32).toString('base64url')
    const verifier = randomBytes(32).toString('base64url')
    const challenge = createHash('sha256').update(verifier).digest('base64url')
    const pending = { userId, loginId, verifier, state }
    await this.redis.set(`auth:github:state:${state}`, JSON.stringify(pending), 'EX', STATE_TTL)
    await this.redis.set(`auth:github:login:${loginId}`, JSON.stringify(pending), 'EX', STATE_TTL)
    const url = new URL(AUTHORIZATION_URL)
    url.search = new URLSearchParams({ client_id: this.settings.githubClientId, redirect_uri: this.settings.githubRedirectUri, scope: GITHUB_OAUTH_SCOPE, state, code_challenge: challenge, code_challenge_method: 'S256' }).toString()
    return { type: 'browser', loginId, authUrl: url.toString(), state }
  }

  async completeCallback(query: Record<string, string | undefined>, cookieState?: string, expectedUserId?: string) {
    if (!this.configured || !query.state || (cookieState && query.state !== cookieState)) throw safeFailure()
    const raw = await this.redis.getdel(`auth:github:state:${query.state}`)
    if (!raw) throw safeFailure()
    let pending: PendingLogin
    try { pending = JSON.parse(raw) as PendingLogin } catch { throw safeFailure() }
    if (!pending.userId || !pending.loginId || !pending.verifier) throw safeFailure()
    if (expectedUserId && pending.userId !== expectedUserId) {
      await this.redis.del(`auth:github:login:${pending.loginId}`)
      await this.redis.set(`auth:github:failed:${pending.loginId}`, '1', 'EX', STATE_TTL)
      throw safeFailure()
    }
    const completing = { ...pending, phase: 'completing' as const }
    await this.redis.set(`auth:github:login:${pending.loginId}`, JSON.stringify(completing), 'EX', STATE_TTL)
    try {
      if (!query.code) throw safeFailure()
      const tokenResponse = await fetch(TOKEN_URL, { method: 'POST', headers: { ...jsonHeaders, 'content-type': 'application/json' }, body: JSON.stringify({ client_id: this.settings.githubClientId, client_secret: this.settings.githubClientSecret, code: query.code, redirect_uri: this.settings.githubRedirectUri, code_verifier: pending.verifier }) })
      if (!tokenResponse.ok) throw safeFailure()
      const token = await tokenResponse.json() as Record<string, unknown>
      if (typeof token.access_token !== 'string') throw safeFailure()
      const profileResponse = await fetch(USER_URL, { headers: { ...jsonHeaders, authorization: `Bearer ${token.access_token}` } })
      if (!profileResponse.ok) throw safeFailure()
      const profile = await profileResponse.json() as Record<string, unknown>
      if (typeof profile.id !== 'number' || typeof profile.login !== 'string') throw safeFailure()
      const key = this.settings.githubTokenEncryptionKey!
      await this.database.transaction((db) => new GithubConnectionRepository(db).save(pending.userId, {
        accessToken: encryptGithubToken(token.access_token as string, key),
        refreshToken: typeof token.refresh_token === 'string' ? encryptGithubToken(token.refresh_token, key) : null,
        accessTokenExpiresAt: typeof token.expires_in === 'number' ? new Date(Date.now() + token.expires_in * 1000) : null,
        refreshTokenExpiresAt: typeof token.refresh_token_expires_in === 'number' ? new Date(Date.now() + token.refresh_token_expires_in * 1000) : null,
        providerSubject: String(profile.id), login: profile.login as string,
        email: typeof profile.email === 'string' ? profile.email : null,
        scopes: typeof token.scope === 'string' ? token.scope : '',
      }))
      await this.redis.del(`auth:github:login:${pending.loginId}`)
      return pending.loginId
    } catch (error) {
      await this.redis.del(`auth:github:login:${pending.loginId}`)
      await this.redis.set(`auth:github:failed:${pending.loginId}`, '1', 'EX', STATE_TTL)
      throw error instanceof GithubConnectionError ? error : safeFailure()
    }
  }

  async loginStatus(userId: string, loginId: string): Promise<ProviderLoginStatus> {
    const pending = await this.redis.get(`auth:github:login:${loginId}`)
    if (pending) {
      try {
        const parsed = JSON.parse(pending) as PendingLogin
        if (parsed.userId === userId) return { status: 'pending' }
      } catch { /* Treat malformed expired state as absent. */ }
    }
    if (await this.redis.exists(`auth:github:failed:${loginId}`)) {
      return { status: 'failed', message: 'Unable to connect the GitHub account. Try again.' }
    }
    const row = await this.database.transaction((db) => new GithubConnectionRepository(db).get(userId))
    return row
      ? { status: 'connected', connection: await this.connection(userId) }
      : { status: 'failed', message: 'Unable to connect the GitHub account. Try again.' }
  }

  async cancelLogin(userId: string, loginId: string) {
    const raw = await this.redis.get(`auth:github:login:${loginId}`)
    if (raw) {
      try {
        const pending = JSON.parse(raw) as PendingLogin
        if (pending.userId === userId && pending.state) {
          await this.redis.del(`auth:github:login:${loginId}`, `auth:github:state:${pending.state}`)
          return
        }
      } catch { /* Fall through to the safe not-found response. */ }
    }
    throw new GithubConnectionError('github_login_not_found', 'This GitHub connection attempt is no longer active.', 404)
  }

  async disconnect(userId: string) {
    if (!this.configured) throw new GithubConnectionError('github_unavailable', 'GitHub connection is not configured.', 503)
    await this.database.transaction((db) => new GithubConnectionRepository(db).delete(userId))
  }

  async accessToken(userId: string) {
    if (!this.configured) return undefined
    const row = await this.database.transaction((db) => new GithubConnectionRepository(db).get(userId))
    if (!row) return undefined
    if (!row.accessTokenExpiresAt || row.accessTokenExpiresAt.getTime() > Date.now() + 60_000) return decryptGithubToken(row.accessToken, this.settings.githubTokenEncryptionKey!)
    const ongoing = this.refreshes.get(userId)
    if (ongoing) return ongoing
    if (row.refreshToken && (!row.refreshTokenExpiresAt || row.refreshTokenExpiresAt.getTime() > Date.now())) {
      const refresh = this.refreshAccessToken(userId, row.refreshToken, row.refreshTokenExpiresAt)
      this.refreshes.set(userId, refresh)
      try { return await refresh } finally { this.refreshes.delete(userId) }
    }
    return undefined
  }

  private async refreshAccessToken(userId: string, storedRefreshToken: string, refreshTokenExpiresAt: Date | null) {
    if (refreshTokenExpiresAt && refreshTokenExpiresAt.getTime() <= Date.now()) return undefined
    {
      const refreshToken = decryptGithubToken(storedRefreshToken, this.settings.githubTokenEncryptionKey!)
      const response = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { ...jsonHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ client_id: this.settings.githubClientId, client_secret: this.settings.githubClientSecret, grant_type: 'refresh_token', refresh_token: refreshToken }),
      })
      if (!response.ok) return undefined
      const value = await response.json() as Record<string, unknown>
      if (typeof value.access_token !== 'string') return undefined
      const nextRefresh = typeof value.refresh_token === 'string' ? value.refresh_token : refreshToken
      const nextAccessExpiry = typeof value.expires_in === 'number' ? new Date(Date.now() + value.expires_in * 1000) : null
      const nextRefreshExpiry = typeof value.refresh_token_expires_in === 'number' ? new Date(Date.now() + value.refresh_token_expires_in * 1000) : refreshTokenExpiresAt
      await this.database.transaction((db) => new GithubConnectionRepository(db).updateTokens(userId, {
        accessToken: encryptGithubToken(value.access_token as string, this.settings.githubTokenEncryptionKey!),
        refreshToken: encryptGithubToken(nextRefresh, this.settings.githubTokenEncryptionKey!),
        accessTokenExpiresAt: nextAccessExpiry,
        refreshTokenExpiresAt: nextRefreshExpiry,
      }))
      return value.access_token as string
    }
  }

  async close() { this.refreshes.clear() }

  private unavailable(): ProviderConnection { return { status: 'unavailable', loginMode: 'browser', account: null, limits: null } }
}
