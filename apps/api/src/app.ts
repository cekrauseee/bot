import { cors } from '@elysiajs/cors'
import { node } from '@elysiajs/node'
import { openapi } from '@elysiajs/openapi'
import { Elysia, ParseError, t, ValidationError } from 'elysia'
import { isIP } from 'node:net'
import type { Settings } from './config.js'
import { AuthError, authDetail } from './errors.js'
import { AuthRepository, normalizeEmail } from './db/repository.js'
import type { Database } from './db/database.js'
import { GoogleOAuthService } from './modules/auth/oauth.js'
import { OtpService } from './modules/auth/otp.js'
import { SessionManager } from './modules/auth/sessions.js'
import { signValue, verifySignedValue } from './security.js'

export type Services = {
  database: Database
  otp: OtpService
  sessions: SessionManager
  google: GoogleOAuthService
}

export type PeerResolver = (request: Request) => string | undefined

type NodeRequest = Request & {
  runtime?: { node?: { req?: { socket?: { remoteAddress?: string } } } }
}

/** Resolve the actual TCP peer supplied by @elysiajs/node's request adapter. */
export const nodeSocketPeer: PeerResolver = (request) =>
  (request as NodeRequest).runtime?.node?.req?.socket?.remoteAddress

/**
 * Return the socket peer unless it is a configured proxy. A proxy may provide
 * exactly one valid X-Forwarded-For value; arbitrary client headers are never
 * used as the peer identity.
 */
export function clientIp(
  request: Request,
  settings: Settings,
  peer: string | undefined | PeerResolver = nodeSocketPeer,
) {
  const socketPeer = typeof peer === 'function' ? peer(request) : peer
  const actualPeer = socketPeer || 'unknown'
  if (!settings.trustedProxyHosts.includes(actualPeer)) return actualPeer

  const forwarded = request.headers.get('x-forwarded-for')?.trim()
  return forwarded && !forwarded.includes(',') && isIP(forwarded) !== 0 ? forwarded : actualPeer
}

const detailSchema = t.Object({
  detail: t.Object({
    code: t.String(),
    message: t.String(),
    retry_after_seconds: t.Optional(t.Integer()),
  }),
})
const challengeSchema = t.Object({
  challenge_id: t.String(),
  expires_in_seconds: t.Integer(),
  resend_after_seconds: t.Integer(),
})
const userSchema = t.Object({
  id: t.String(),
  email: t.String({ format: 'email' }),
  first_name: t.Union([t.String(), t.Null()]),
  last_name: t.Union([t.String(), t.Null()]),
  avatar_url: t.Union([t.String(), t.Null()]),
})
const otpRequestBody = t.Object({ email: t.String({ format: 'email' }) })
const otpVerifyBody = t.Object({
  challenge_id: t.String({ minLength: 32, maxLength: 128 }),
  code: t.String({ pattern: '^\\d{6}$' }),
})
const otpRequestResponses = {
  202: challengeSchema,
  400: detailSchema,
  429: detailSchema,
  503: detailSchema,
  422: detailSchema,
}
const otpVerifyResponses = {
  200: t.Object({ user: userSchema }),
  400: detailSchema,
  429: detailSchema,
  503: detailSchema,
  422: detailSchema,
}

const cookieValue = (request: Request, name: string) => {
  const prefix = `${name}=`
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const trimmed = part.trim()
    if (trimmed.startsWith(prefix)) {
      try { return decodeURIComponent(trimmed.slice(prefix.length)) } catch { return undefined }
    }
  }
  return undefined
}

const userResponse = (user: { id: string; email: string; firstName: string | null; lastName: string | null; avatarUrl: string | null }) => ({
  id: user.id,
  email: user.email,
  first_name: user.firstName,
  last_name: user.lastName,
  avatar_url: user.avatarUrl,
})

export function createApp(settings: Settings, services: Services, peerResolver: PeerResolver = nodeSocketPeer) {
  const app = new Elysia({ name: 'mybot-api', adapter: node() })
    .use(cors({
      origin: settings.webOrigin,
      credentials: true,
      methods: ['GET', 'POST'],
      allowedHeaders: ['Content-Type'],
    }))
    .use(openapi({ documentation: { info: { title: 'myBot API', version: '0.1.0' } } }))
    .onError(({ error, set }) => {
      if (error instanceof AuthError) {
        set.status = error.statusCode
        if (error.retryAfterSeconds != null) set.headers['Retry-After'] = String(error.retryAfterSeconds)
        return authDetail(error)
      }
      if (error instanceof ValidationError || error instanceof ParseError) {
        set.status = 422
        return { detail: { code: 'invalid_request', message: 'Invalid request.' } }
      }
      if ((error as { code?: string }).code === 'NOT_FOUND') {
        set.status = 404
        return { detail: { code: 'not_found', message: 'Not Found' } }
      }
      set.status = 500
      return { detail: { code: 'internal_error', message: 'An unexpected error occurred.' } }
    })

  const browserOrigin = (request: Request) => {
    const origin = request.headers.get('origin')
    if (origin === settings.webOrigin || (settings.environment !== 'production' && !origin)) return
    throw new AuthError('invalid_origin', 'This request did not come from an allowed origin.', 403)
  }

  const oauthStateCookieName = settings.environment === 'production' ? '__Host-mybot_oauth_state' : 'mybot_oauth_state'
  const oauthStateCookie = (state: string) => `${oauthStateCookieName}=${encodeURIComponent(signValue(state, settings.sessionSecret))}; Max-Age=600; Path=/; HttpOnly; SameSite=Lax${settings.secureCookies ? '; Secure' : ''}`
  const clearOauthStateCookie = () => `${oauthStateCookieName}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${settings.secureCookies ? '; Secure' : ''}`

  app.get('/health', () => ({ status: 'ok' as const }), { response: t.Object({ status: t.Literal('ok') }) })

  app.post('/auth/otp/request', async ({ request, body, set }) => {
    browserOrigin(request)
    const challenge = await services.otp.issue(normalizeEmail(body.email), clientIp(request, settings, peerResolver))
    set.status = 202
    return {
      challenge_id: challenge.challengeId,
      expires_in_seconds: challenge.expiresInSeconds,
      resend_after_seconds: challenge.resendAfterSeconds,
    }
  }, { body: otpRequestBody, response: otpRequestResponses })

  app.post('/auth/otp/verify', async ({ request, body, set }) => {
    browserOrigin(request)
    const reservation = await services.otp.reserve(body.challenge_id, body.code, clientIp(request, settings, peerResolver))
    let issued: { user: Parameters<typeof userResponse>[0]; session: { token: string } }
    try {
      issued = await services.database.transaction(async (db) => {
        const repository = new AuthRepository(db)
        const user = await repository.getOrCreateEmailUser(reservation.email, { emailVerifiedAt: new Date() })
        const session = await services.sessions.issue(repository, user.id)
        return { user, session }
      })
    } catch (error) {
      await services.otp.release(reservation)
      throw error
    }
    try {
      if (!await services.otp.finalize(reservation)) {
        throw new AuthError('invalid_code', 'That code is invalid or has expired. Request a new code.', 400)
      }
    } catch (error) {
      await services.otp.release(reservation)
      throw error
    }
    set.status = 200
    set.headers['Set-Cookie'] = services.sessions.cookie(issued.session.token)
    return { user: userResponse(issued.user) }
  }, { body: otpVerifyBody, response: otpVerifyResponses })

  app.get('/auth/google/start', async () => {
    const result = await services.google.start()
    return new Response(null, {
      status: 303,
      headers: { Location: result.url, 'Set-Cookie': oauthStateCookie(result.state) },
    })
  }, { response: { 303: t.Void(), 503: detailSchema } })

  app.get('/auth/google/callback', async ({ request }) => {
    const url = new URL(request.url)
    const query = Object.fromEntries(url.searchParams.entries())
    const state = verifySignedValue(cookieValue(request, oauthStateCookieName), settings.sessionSecret)
    try {
      const profile = await services.google.callback(query, state)
      const issued = await services.database.transaction(async (db) => {
        const repository = new AuthRepository(db)
        const user = await repository.getOrCreateGoogleUser({
          providerSubject: profile.subject,
          email: profile.email,
          firstName: profile.firstName,
          lastName: profile.lastName,
          avatarUrl: profile.avatarUrl,
          providerEmail: profile.email,
        })
        return services.sessions.issue(repository, user.id)
      })
      const headers = new Headers({ Location: `${settings.webOrigin}/` })
      headers.append('Set-Cookie', services.sessions.cookie(issued.token))
      headers.append('Set-Cookie', clearOauthStateCookie())
      return new Response(null, { status: 303, headers })
    } catch {
      const headers = new Headers({ Location: `${settings.webOrigin}/login?error=google` })
      headers.append('Set-Cookie', clearOauthStateCookie())
      return new Response(null, { status: 303, headers })
    }
  }, { response: { 303: t.Void() } })

  app.get('/auth/session', async ({ request }) => {
    const token = cookieValue(request, settings.sessionCookieName)
    const session = await services.database.transaction(async (db) => {
      const repository = new AuthRepository(db)
      const active = await services.sessions.resolve(repository, token)
      if (!active) throw new AuthError('unauthorized', 'Sign in to continue.', 401)
      await repository.touchSession(active.id)
      return active
    })
    return userResponse(session.user!)
  }, { response: { 200: userSchema, 401: detailSchema } })

  app.post('/auth/sign-out', async ({ request }) => {
    browserOrigin(request)
    const token = cookieValue(request, settings.sessionCookieName)
    if (token) {
      await services.database.transaction(async (db) => {
        const repository = new AuthRepository(db)
        const session = await services.sessions.resolve(repository, token)
        if (session) await repository.revokeSession(session.id)
      })
    }
    return new Response(null, { status: 204, headers: { 'Set-Cookie': services.sessions.clearCookie() } })
  }, { response: { 204: t.Void(), 403: detailSchema } })

  return app
}
