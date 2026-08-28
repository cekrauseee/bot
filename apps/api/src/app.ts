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
const validationDetailSchema = t.Object({
  detail: t.Array(t.Object({
    loc: t.Array(t.Union([t.String(), t.Integer()])),
    msg: t.String(),
    type: t.String(),
    input: t.Optional(t.Unknown()),
    ctx: t.Optional(t.Record(t.String(), t.Unknown())),
  })),
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
  422: validationDetailSchema,
}
const otpVerifyResponses = {
  200: t.Object({ user: userSchema }),
  400: detailSchema,
  429: detailSchema,
  503: detailSchema,
  422: validationDetailSchema,
}

type ValidationIssue = {
  path?: string
  message?: string
  type?: number | string
  value?: unknown
  schema?: Record<string, unknown>
}

type JsonBodyProfile = {
  length: number
  firstIndex?: number
  firstChar?: string
  lastIndex?: number
  lastChar?: string
  previousLastChar?: string
  openContainer?: '{' | '['
  openContainerIndex?: number
  lastDelimiterIndex?: number
  trailingComma?: '{' | '['
  trailingCommaIndex?: number
  repeatedCommaIndex?: number
  repeatedCommaContainer?: '{' | '['
  incompleteLiteral?: boolean
  invalidEscapeIndex?: number
  invalidUnicodeIndex?: number
  controlCharacterIndex?: number
  unterminatedStringIndex?: number
}

const profileJsonBody = (body: string): JsonBodyProfile => {
  const profile: JsonBodyProfile = { length: body.length }
  const stack: Array<{ kind: '{' | '['; index: number }> = []
  let inString = false
  let stringStart: number | undefined
  let escaped = false
  let lastSignificant: { char: string; index: number } | undefined
  let previousSignificant: { char: string; index: number } | undefined
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index]
    if (inString) {
      if (escaped) {
        if (char === 'u') {
          const hexadecimal = body.slice(index + 1, index + 5)
          if (hexadecimal.length < 4 || !/^[0-9a-f]{4}$/i.test(hexadecimal)) profile.invalidUnicodeIndex ??= index
          index += Math.min(4, hexadecimal.length)
        } else if (!'"\\/bfnrt'.includes(char)) {
          profile.invalidEscapeIndex ??= index - 1
        }
        escaped = false
      } else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      else if (char.charCodeAt(0) < 0x20) profile.controlCharacterIndex ??= index
      continue
    }
    if (char === '"') {
      inString = true
      stringStart = index
      continue
    }
    if (/\s/.test(char)) continue
    const priorLastSignificant = lastSignificant
    const priorPreviousSignificant = previousSignificant
    if (profile.firstIndex === undefined) {
      profile.firstIndex = index
      profile.firstChar = char
    }
    profile.lastIndex = index
    profile.lastChar = char
    profile.previousLastChar = lastSignificant?.char
    previousSignificant = lastSignificant
    lastSignificant = { char, index }
    if (char === '{' || char === '[') {
      stack.push({ kind: char, index })
      profile.lastDelimiterIndex = index
    } else if (char === '}' || char === ']') {
      const opening = stack.pop()
      if (opening && priorLastSignificant?.char === ',' && priorPreviousSignificant?.char !== ',') {
        profile.trailingComma = opening.kind
        profile.trailingCommaIndex = priorLastSignificant.index
      }
    }
    else if (char === ':' || char === ',') profile.lastDelimiterIndex = index
  }
  if (inString && stringStart !== undefined) profile.unterminatedStringIndex = stringStart
  const open = stack.at(-1)
  if (open) {
    profile.openContainer = open.kind
    profile.openContainerIndex = open.index
  }
  if (lastSignificant?.char === ',' && previousSignificant?.char !== ',') {
    profile.trailingComma = stack.at(-1)?.kind
    profile.trailingCommaIndex = lastSignificant.index
  }
  const lastBodyIndex = body.search(/\s*$/) - 1
  const closing = lastBodyIndex >= 0 ? body[lastBodyIndex] : undefined
  if ((closing === '}' || closing === ']') && body[lastBodyIndex - 1] === ',') {
    const commaIndex = lastBodyIndex - 1
    if (body[commaIndex - 1] === ',') {
      profile.trailingComma = undefined
      profile.trailingCommaIndex = undefined
      profile.repeatedCommaIndex = commaIndex
      profile.repeatedCommaContainer = closing === '}' ? '{' : '['
    }
    else {
      profile.trailingComma = closing === '}' ? '{' : '['
      profile.trailingCommaIndex = commaIndex
    }
  }
  if (profile.openContainer && profile.lastDelimiterIndex !== undefined) {
    const tail = body.slice(profile.lastDelimiterIndex + 1).trim()
    profile.incompleteLiteral = /^(?:t|tr|tru|f|fa|fal|fals|n|nu|nul)$/.test(tail)
  }
  return profile
}

const validationContext = (issue: ValidationIssue, type: string) => {
  if (type === 'string_too_short' && issue.schema?.minLength !== undefined) {
    return { min_length: issue.schema.minLength }
  }
  if (type === 'string_too_long' && issue.schema?.maxLength !== undefined) {
    return { max_length: issue.schema.maxLength }
  }
  if (type === 'string_pattern_mismatch' && issue.schema?.pattern !== undefined) {
    return { pattern: issue.schema.pattern }
  }
  return undefined
}

const validationType = (issue: ValidationIssue) => {
  if (issue.schema?.type === 'string') {
    if (issue.value === undefined) return 'missing'
    if (issue.value !== undefined && typeof issue.value !== 'string') return 'string_type'
    if (issue.schema.pattern !== undefined) return 'string_pattern_mismatch'
    if (issue.schema.minLength !== undefined && issue.value.length < Number(issue.schema.minLength)) return 'string_too_short'
    if (issue.schema.maxLength !== undefined && issue.value.length > Number(issue.schema.maxLength)) return 'string_too_long'
    return issue.schema.format ? 'value_error' : 'string_type'
  }
  return `typebox_${String(issue.type ?? 'validation')}`
}

const validationDetails = (error: ValidationError | ParseError, request: Request, bodyProfiles: WeakMap<Request, JsonBodyProfile>) => {
  if (!(error instanceof ValidationError)) {
    const cause = (error as ParseError & { cause?: unknown }).cause
    const causeMessage = cause instanceof Error ? cause.message : String(cause ?? '')
    const explicitOffset = causeMessage.match(/position (\d+)/)?.[1]
    const profile = bodyProfiles.get(request)
    const explicitPosition = explicitOffset === undefined ? undefined : Number(explicitOffset)
    const specialOffset = causeMessage.startsWith('Exponent part') || causeMessage.startsWith('Unterminated fractional') || causeMessage.startsWith('No number after minus') ? -1 : 0
    const offset = profile?.invalidEscapeIndex ?? profile?.invalidUnicodeIndex ?? profile?.controlCharacterIndex ?? profile?.unterminatedStringIndex ?? profile?.repeatedCommaIndex ??
      (profile?.trailingCommaIndex !== undefined ? profile.trailingCommaIndex : undefined) ??
      (explicitPosition !== undefined
        ? explicitPosition - (causeMessage.startsWith('Expected double-quoted property name') ? 1 : 0) + specialOffset
        : profile?.length)
    const parserError = profile?.invalidEscapeIndex !== undefined
      ? 'Invalid \\escape'
      : profile?.invalidUnicodeIndex !== undefined
        ? 'Invalid \\uXXXX escape'
        : profile?.controlCharacterIndex !== undefined
          ? 'Invalid control character at'
          : profile?.trailingComma === '['
            ? 'Illegal trailing comma before end of array'
            : profile?.repeatedCommaContainer === '{'
              ? 'Expecting property name enclosed in double quotes'
              : profile?.repeatedCommaContainer === '['
                ? 'Expecting value'
            : causeMessage.startsWith("Expected property name")
      ? 'Expecting property name enclosed in double quotes'
      : causeMessage.startsWith("Expected ','")
        ? "Expecting ',' delimiter"
      : causeMessage.startsWith('Expected double-quoted property name')
          ? 'Illegal trailing comma before end of object'
          : causeMessage.startsWith("Unexpected token ']'")
            ? 'Illegal trailing comma before end of array'
            : causeMessage.startsWith('Unexpected non-whitespace') || causeMessage.startsWith('Exponent part') || causeMessage.startsWith('Unterminated fractional')
              ? 'Extra data'
              : causeMessage.startsWith('Unterminated string') || profile?.unterminatedStringIndex !== undefined
                ? 'Unterminated string starting at'
                : causeMessage.startsWith('Bad escaped') || profile?.invalidEscapeIndex !== undefined
                  ? 'Invalid \\escape'
                  : causeMessage.startsWith('Bad Unicode') || profile?.invalidUnicodeIndex !== undefined
                    ? 'Invalid \\uXXXX escape'
                    : causeMessage.startsWith('Bad control') || profile?.controlCharacterIndex !== undefined
                      ? 'Invalid control character at'
                      : causeMessage.startsWith('Unexpected end') || causeMessage.startsWith('Unexpected token') || causeMessage.startsWith('No number after minus')
                        ? 'Expecting value'
                        : 'Invalid JSON'
    const canonicalOffset = profile?.repeatedCommaIndex !== undefined
      ? profile.repeatedCommaIndex
      : profile?.trailingCommaIndex !== undefined
      ? profile.trailingCommaIndex
      : profile?.invalidEscapeIndex !== undefined || profile?.invalidUnicodeIndex !== undefined || profile?.controlCharacterIndex !== undefined || profile?.unterminatedStringIndex !== undefined
        ? offset
        : causeMessage.startsWith('Unexpected token') && profile?.firstIndex !== undefined
          ? profile.firstIndex
      : causeMessage.startsWith('Unexpected end') && profile?.firstChar && !['{', '[', '"'].includes(profile.firstChar)
      ? profile.firstIndex
      : causeMessage.startsWith('Unexpected end') && profile?.incompleteLiteral && profile.lastDelimiterIndex !== undefined
        ? profile.lastDelimiterIndex + 1
        : causeMessage.startsWith('Unexpected end') && profile?.openContainer && profile.lastChar !== profile.openContainer && profile.lastChar !== ',' && profile.lastChar !== ':'
        ? profile.length
        : offset
    return {
      detail: [{
        loc: ['body', ...(canonicalOffset !== undefined ? [canonicalOffset] : [])],
        msg: 'JSON decode error',
        type: 'json_invalid',
        input: {},
        ctx: { error: parserError },
      }],
    }
  }
  return {
    detail: error.all.map((issue) => {
      const typedIssue = issue as ValidationIssue
      const path = typedIssue.path?.split('/').filter(Boolean) ?? []
      const input = typedIssue.value !== undefined ? typedIssue.value : error.value
      const type = validationType(typedIssue)
      const context = validationContext(typedIssue, type)
      const emailReason = type === 'value_error' && typedIssue.schema?.format === 'email' &&
        typeof input === 'string' && !input.includes('@')
        ? 'An email address must have an @-sign.'
        : undefined
      const message = type === 'missing'
        ? 'Field required'
        : type === 'string_too_short'
          ? `String should have at least ${typedIssue.schema?.minLength} characters`
          : type === 'string_too_long'
            ? `String should have at most ${typedIssue.schema?.maxLength} characters`
            : type === 'string_pattern_mismatch'
              ? `String should match pattern '${typedIssue.schema?.pattern}'`
              : type === 'string_type'
                ? 'Input should be a valid string'
                : emailReason
                  ? `value is not a valid email address: ${emailReason}`
                : typedIssue.message ?? typedIssue.path ?? 'Invalid value.'
      return {
        loc: [error.type, ...path],
        msg: message,
        type,
        ...(input !== undefined ? { input } : {}),
        ...(context ? { ctx: context } : {}),
        ...(emailReason ? { ctx: { reason: emailReason } } : {}),
      }
    }),
  }
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
  const requestBodyProfiles = new WeakMap<Request, JsonBodyProfile>()
  const app = new Elysia({ name: 'mybot-api', adapter: node() })
    .onRequest(async ({ request }) => {
      if (request.headers.get('content-type')?.startsWith('application/json')) {
        try { requestBodyProfiles.set(request, profileJsonBody(await request.clone().text())) } catch { /* parser reports the failure */ }
      }
    })
    .use(cors({
      origin: settings.webOrigin,
      credentials: true,
      methods: ['GET', 'POST'],
      allowedHeaders: ['Content-Type'],
    }))
    .use(openapi({ documentation: { info: { title: 'myBot API', version: '0.1.0' } } }))
    .onError(({ error, request, set }) => {
      if (error instanceof AuthError) {
        set.status = error.statusCode
        if (error.retryAfterSeconds != null) set.headers['Retry-After'] = String(error.retryAfterSeconds)
        return authDetail(error)
      }
      if (error instanceof ValidationError || error instanceof ParseError) {
        set.status = 422
        return validationDetails(error, request, requestBodyProfiles)
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

  app.get('/auth/google/start', async ({ set }) => {
    const result = await services.google.start()
    set.status = 303
    set.headers.Location = result.url
    set.headers['set-cookie'] = [oauthStateCookie(result.state)] as any
    return undefined
  }, { response: { 303: t.Void(), 503: detailSchema } })

  app.get('/auth/google/callback', async ({ request, set }) => {
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
      set.status = 303
      set.headers.Location = `${settings.webOrigin}/`
      set.headers['set-cookie'] = [services.sessions.cookie(issued.token), clearOauthStateCookie()] as any
      return undefined
    } catch {
      set.status = 303
      set.headers.Location = `${settings.webOrigin}/login?error=google`
      set.headers['set-cookie'] = [clearOauthStateCookie()] as any
      return undefined
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
