import { cors } from '@elysiajs/cors'
import { node } from '@elysiajs/node'
import { openapi } from '@elysiajs/openapi'
import { Elysia, ParseError, t, ValidationError } from 'elysia'
import type { Settings } from './config.js'
import { AuthError, authDetail } from './errors.js'
import {
  AuthRepository,
  AgentRunRepository,
  ConversationRepository,
  ConversationPinError,
  ProjectOrderError,
  ProjectRepository,
  normalizeEmail,
  type AgentRun,
  type User,
} from './db/repository.js'
import type { Database } from './db/database.js'
import { GoogleOAuthService } from './modules/auth/oauth.js'
import { OtpService } from './modules/auth/otp.js'
import { SessionManager } from './modules/auth/sessions.js'
import { DesktopAuthService } from './modules/auth/desktop.js'
import {
  ProviderConnectionError,
  type ProviderConnection,
  type ProviderConnectionAdapter,
  type ProviderConnectionRegistry,
  type ProviderConnectionSettings,
} from './modules/provider-connections.js'
import { signValue, verifySignedValue } from './security.js'
import type { GithubConnectionService } from './modules/github-connection.js'
import {
  conversationTitle,
  createAiClient,
  publicConversation,
  publicMessage,
  type AiClient,
  type TurnOptions,
} from './modules/conversations.js'
import {
  AgentRunExecutor,
  publicAgentEvent,
} from './modules/agent-control-plane.js'
import {
  modelCatalog,
  modelDefinition,
  publicModelCatalog,
  validModelSelection,
} from './modules/models.js'
import {
  normalizeProjectName,
  projectSlug,
  publicProject,
} from './modules/projects.js'
import {
  createLogger,
  requestHeaders,
  requestIdsFor,
  requestLogFields,
  safeError,
  setRequestOutcome,
  trackedResponse,
  type RequestContext,
  type RequestOutcome,
} from './logger.js'

const DESKTOP_RENDERER_ORIGIN = 'app://mybot'

export type Services = {
  database: Database
  otp: OtpService
  sessions: SessionManager
  desktopAuth?: DesktopAuthService
  google: GoogleOAuthService
  ai?: AiClient
  agentRuns?: AgentRunExecutor
  providerConnectionAdapters?: ProviderConnectionRegistry
  providerConnectionSettings?: ProviderConnectionSettings
  github?: GithubConnectionService
}

export type PeerResolver = (request: Request) => string | undefined

type NodeRequest = Request & {
  runtime?: {
    node?: {
      req?: {
        socket?: {
          remoteAddress?: string
          on(event: 'error', listener: (error: Error) => void): void
          once(event: 'close', listener: () => void): void
          off(event: 'error', listener: (error: Error) => void): void
        }
      }
    }
  }
}

/** Resolve the actual TCP peer supplied by @elysiajs/node's request adapter. */
export const nodeSocketPeer: PeerResolver = (request) =>
  (request as NodeRequest).runtime?.node?.req?.socket?.remoteAddress

export function clientIp(
  request: Request,
  peer: string | undefined | PeerResolver = nodeSocketPeer,
) {
  const socketPeer = typeof peer === 'function' ? peer(request) : peer
  return socketPeer || 'unknown'
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
  development_code: t.Optional(t.String({ pattern: '^\\d{6}$' })),
  challenge_id: t.String(),
  expires_in_seconds: t.Integer(),
  resend_after_seconds: t.Integer(),
})
const modelSchema = t.Union(modelCatalog.map(({ id }) => t.Literal(id)))
const userSchema = t.Object({
  id: t.String(),
  email: t.String({ format: 'email' }),
  first_name: t.Union([t.String(), t.Null()]),
  last_name: t.Union([t.String(), t.Null()]),
  avatar_url: t.Union([t.String(), t.Null()]),
  default_model: t.String(),
  default_reasoning_effort: t.String(),
  default_speed: t.String(),
})
const providerLimitWindowSchema = t.Object({
  used_percent: t.Number({ minimum: 0, maximum: 100 }),
  window_duration_minutes: t.Union([t.Number(), t.Null()]),
  resets_at: t.Union([t.String(), t.Null()]),
})
const providerConnectionSchema = t.Object({
  status: t.Union([
    t.Literal('unavailable'),
    t.Literal('disconnected'),
    t.Literal('connecting'),
    t.Literal('connected'),
  ]),
  account: t.Union([
    t.Object({
      email: t.Union([t.String(), t.Null()]),
      plan_type: t.String(),
    }),
    t.Null(),
  ]),
  limits: t.Union([
    t.Object({
      primary: t.Union([providerLimitWindowSchema, t.Null()]),
      secondary: t.Union([providerLimitWindowSchema, t.Null()]),
      reached: t.Boolean(),
    }),
    t.Null(),
  ]),
  login_mode: t.Union([t.Literal('browser'), t.Literal('device')]),
  active: t.Boolean(),
})
const providerConnectionStateBody = t.Object({ active: t.Boolean() })
const providerConnectionSummarySchema = t.Object({
  connection_id: t.String(),
  provider: t.String(),
  status: t.Union([
    t.Literal('unavailable'),
    t.Literal('disconnected'),
    t.Literal('connecting'),
    t.Literal('connected'),
  ]),
  account: t.Union([
    t.Object({
      email: t.Union([t.String(), t.Null()]),
      plan_type: t.String(),
    }),
    t.Null(),
  ]),
  limits: t.Union([
    t.Object({
      primary: t.Union([providerLimitWindowSchema, t.Null()]),
      secondary: t.Union([providerLimitWindowSchema, t.Null()]),
      reached: t.Boolean(),
    }),
    t.Null(),
  ]),
  login_mode: t.Union([t.Literal('browser'), t.Literal('device')]),
  active: t.Boolean(),
})
const providerLoginSchema = t.Union([
  t.Object({
    type: t.Literal('browser'),
    login_id: t.String(),
    auth_url: t.String({ format: 'uri' }),
  }),
  t.Object({
    type: t.Literal('device_code'),
    login_id: t.String(),
    verification_url: t.String({ format: 'uri' }),
    user_code: t.String(),
  }),
])
const providerLoginStatusSchema = t.Object({
  status: t.Union([
    t.Literal('pending'),
    t.Literal('connected'),
    t.Literal('failed'),
  ]),
  connection: t.Optional(providerConnectionSchema),
  message: t.Optional(t.String()),
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

const bearerValue = (request: Request) => {
  const value = request.headers.get('authorization')
  if (!value) return undefined
  const match = /^Bearer ([A-Za-z0-9_-]{32,256})$/.exec(value)
  if (!match) throw new AuthError('unauthorized', 'Sign in to continue.', 401)
  return match[1]
}

const userResponse = (user: Pick<User, 'id' | 'email' | 'firstName' | 'lastName' | 'avatarUrl' | 'defaultModel' | 'defaultReasoningEffort' | 'defaultSpeed'>) => ({
  id: user.id,
  email: user.email,
  first_name: user.firstName,
  last_name: user.lastName,
  avatar_url: user.avatarUrl,
  default_model: user.defaultModel,
  default_reasoning_effort: user.defaultReasoningEffort,
  default_speed: user.defaultSpeed,
})

const publicProviderConnection = (connection: ProviderConnection, active: boolean) => ({
  status: connection.status,
  account: connection.account
    ? {
        email: connection.account.email,
        plan_type: connection.account.planType,
      }
    : null,
  limits: connection.limits
    ? {
        primary: connection.limits.primary
          ? {
              used_percent: connection.limits.primary.usedPercent,
              window_duration_minutes:
                connection.limits.primary.windowDurationMinutes,
              resets_at: connection.limits.primary.resetsAt,
            }
          : null,
        secondary: connection.limits.secondary
          ? {
              used_percent: connection.limits.secondary.usedPercent,
              window_duration_minutes:
                connection.limits.secondary.windowDurationMinutes,
              resets_at: connection.limits.secondary.resetsAt,
            }
          : null,
        reached: connection.limits.reached,
      }
    : null,
  login_mode: connection.loginMode,
  active,
})

export function createApp(settings: Settings, services: Services, peerResolver: PeerResolver = nodeSocketPeer) {
  const requestBodyProfiles = new WeakMap<Request, JsonBodyProfile>()
  const requestContexts = new WeakMap<Request, RequestContext>()
  const guardedUpgradeSockets = new WeakSet<object>()
  const logger = createLogger(settings)
  const guardUpgradeSocket = (request: Request) => {
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return
    const socket = (request as NodeRequest).runtime?.node?.req?.socket
    if (!socket || guardedUpgradeSockets.has(socket)) return
    guardedUpgradeSockets.add(socket)

    // crossws writes rejected upgrade responses directly to the raw Node socket.
    // If the client disconnects while an async hook is running, that write emits
    // EPIPE without a library-owned listener and would otherwise terminate Node.
    const absorbTransportError = () => undefined
    socket.on('error', absorbTransportError)
    socket.once('close', () => {
      socket.off('error', absorbTransportError)
      guardedUpgradeSockets.delete(socket)
    })
  }
  const completeRequest = (
    context: RequestContext,
    request: Request,
    statusCode: number,
    outcome: RequestOutcome,
  ) => {
    if (context.completed) return
    context.completed = true
    setRequestOutcome(request, outcome)
    logger.info({ ...requestLogFields(context), event: 'request_completed', http_status_code: statusCode,
      duration_ms: Math.round((performance.now() - context.startedAt) * 100) / 100, outcome }, 'request_completed')
  }
  const agentExecutor = services.agentRuns ?? new AgentRunExecutor(
    services.database,
    services.ai ?? createAiClient(settings),
  )
  if (services.agentRuns && typeof (services.database as { transaction?: unknown }).transaction === 'function') {
    agentExecutor.startRecoverySweeper()
  }
  const app = new Elysia({ name: 'mybot-api', adapter: node() })
    .onRequest(async ({ request }) => {
      guardUpgradeSocket(request)
      const ids = requestIdsFor(request)
      const context: RequestContext = { ...ids, startedAt: performance.now(), httpMethod: request.method }
      requestContexts.set(request, context)
      logger.debug({ ...requestLogFields(context), event: 'request_started' }, 'request_started')
      if (request.headers.get('content-type')?.startsWith('application/json')) {
        try { requestBodyProfiles.set(request, profileJsonBody(await request.clone().text())) } catch { /* parser reports the failure */ }
      }
    })
    .use(cors({
      origin: [settings.webOrigin, DESKTOP_RENDERER_ORIGIN],
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-Correlation-Id'],
      exposeHeaders: ['X-Request-Id', 'X-Correlation-Id'],
    }))
    .use(openapi({ documentation: { info: { title: 'myBot API', version: '0.1.0' } } }))
    .onError(({ error, request, route, set }) => {
      const context = requestContexts.get(request)
      if (context) {
        context.httpRoute = typeof route === 'string' && route ? route : new URL(request.url).pathname
        context.error = safeError(error, error instanceof AuthError ? error.statusCode : error instanceof ValidationError || error instanceof ParseError ? 422 : undefined)
        logger.warn({ ...requestLogFields(context), event: 'request_error' }, 'request_error')
        Object.assign(set.headers, requestHeaders(context))
      }
      if (error instanceof AuthError) {
        set.status = error.statusCode
        if (error.retryAfterSeconds != null) set.headers['Retry-After'] = String(error.retryAfterSeconds)
        const response = authDetail(error)
        if (context) completeRequest(context, request, Number(set.status) || 500, 'error')
        return response
      }
      if (error instanceof ValidationError || error instanceof ParseError) {
        set.status = 422
        const response = validationDetails(error, request, requestBodyProfiles)
        if (context) completeRequest(context, request, Number(set.status) || 422, 'error')
        return response
      }
      if ((error as { code?: string }).code === 'NOT_FOUND') {
        set.status = 404
        const response = { detail: { code: 'not_found', message: 'Not Found' } }
        if (context) completeRequest(context, request, Number(set.status) || 404, 'error')
        return response
      }
      set.status = 500
      const response = { detail: { code: 'internal_error', message: 'An unexpected error occurred.' } }
      if (context) completeRequest(context, request, Number(set.status) || 500, 'error')
      return response
    })
    .onAfterHandle(({ request, response, route, set }) => {
      const context = requestContexts.get(request)
      if (!context) return response
      context.httpRoute = typeof route === 'string' && route ? route : new URL(request.url).pathname
      const headers = requestHeaders(context)
      Object.assign(set.headers, headers)
      if (response instanceof Response) {
        for (const [name, value] of Object.entries(headers)) response.headers.set(name, value)
      }
      const complete = (statusCode: number, outcome: RequestOutcome) => completeRequest(context, request, statusCode, outcome)
      if (response instanceof Response) return trackedResponse(response, complete, request)
      const statusCode = Number(set.status) || 200
      complete(statusCode, context.completed ? 'success' : statusCode >= 400 ? 'error' : 'success')
      return response
    })
    .onStop(() =>
      Promise.allSettled([
        agentExecutor.close(),
        ...Object.values(services.providerConnectionAdapters ?? {})
          .map((registration) => registration.adapter)
          .filter((adapter): adapter is ProviderConnectionAdapter => adapter !== undefined)
          .map((adapter) => adapter.close()),
      ]),
    )

  const browserOrigin = (request: Request) => {
    const origin = request.headers.get('origin')
    if (origin === settings.webOrigin || origin === DESKTOP_RENDERER_ORIGIN || (settings.environment !== 'production' && !origin)) return
    throw new AuthError('invalid_origin', 'This request did not come from an allowed origin.', 403)
  }
  const webBrowserOrigin = (request: Request) => {
    const origin = request.headers.get('origin')
    if (origin === settings.webOrigin) return
    throw new AuthError('invalid_origin', 'This request did not come from the web application.', 403)
  }
  const websocketOrigin = (request: Request) => {
    if (bearerValue(request)) return
    if (request.headers.get('origin') === settings.webOrigin || request.headers.get('origin') === DESKTOP_RENDERER_ORIGIN) return
    throw new AuthError('invalid_origin', 'This request did not come from an allowed origin.', 403)
  }

  const oauthStateCookieName = settings.environment === 'production' ? '__Host-mybot_oauth_state' : 'mybot_oauth_state'
  const githubOauthStateCookieName = settings.environment === 'production' ? '__Host-mybot_github_oauth_state' : 'mybot_github_oauth_state'
  const desktopTransactionCookieName = 'mybot_desktop_transaction'
  const oauthStateCookie = (state: string) => `${oauthStateCookieName}=${encodeURIComponent(signValue(state, settings.sessionSecret))}; Max-Age=600; Path=/; HttpOnly; SameSite=Lax${settings.secureCookies ? '; Secure' : ''}`
  const clearOauthStateCookie = () => `${oauthStateCookieName}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${settings.secureCookies ? '; Secure' : ''}`
  const githubOauthStateCookie = (state: string) => `${githubOauthStateCookieName}=${encodeURIComponent(signValue(state, settings.sessionSecret))}; Max-Age=600; Path=/; HttpOnly; SameSite=Lax${settings.secureCookies ? '; Secure' : ''}`
  const clearGithubOauthStateCookie = () => `${githubOauthStateCookieName}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${settings.secureCookies ? '; Secure' : ''}`
  const desktopRequestOrigin = (request: Request) => {
    const origin = request.headers.get('origin')
    if (!origin || origin === settings.webOrigin || origin === DESKTOP_RENDERER_ORIGIN) return
    throw new AuthError('invalid_origin', 'This request did not come from an allowed origin.', 403)
  }

  const desktopTransactionSchema = t.Object({
    transaction_id: t.String({ minLength: 32, maxLength: 64, pattern: '^[A-Za-z0-9_-]+$' }),
    client_secret: t.String({ minLength: 32, maxLength: 128 }),
  })
  const desktopStartSchema = t.Object({
    transaction_id: t.String(),
    client_secret: t.String(),
    verification_url: t.String({ format: 'uri' }),
    expires_in_seconds: t.Integer(),
  })
  const desktopCompletionBodySchema = t.Object({
    transaction_id: t.String({ minLength: 32, maxLength: 64, pattern: '^[A-Za-z0-9_-]+$' }),
  })
  const desktopCompletionSchema = t.Object({
    callback_url: t.String({ format: 'uri' }),
  })

  app.get('/health', () => ({ status: 'ok' as const }), { response: t.Object({ status: t.Literal('ok') }) })

  app.post('/auth/desktop/start', async ({ request, set }) => {
    desktopRequestOrigin(request)
    if (!services.desktopAuth) throw new AuthError('desktop_auth_unavailable', 'Desktop sign-in is unavailable.', 503)
    const result = await services.desktopAuth.start()
    set.headers['cache-control'] = 'no-store'
    return {
      transaction_id: result.transactionId,
      client_secret: result.clientSecret,
      verification_url: result.verificationUrl,
      expires_in_seconds: result.expiresInSeconds,
    }
  }, { response: { 200: desktopStartSchema, 403: detailSchema, 503: detailSchema } })

  app.post('/auth/desktop/exchange', async ({ request, body, set }) => {
    desktopRequestOrigin(request)
    if (!services.desktopAuth) throw new AuthError('desktop_auth_unavailable', 'Desktop sign-in is unavailable.', 503)
    const userId = await services.desktopAuth.exchange(body.transaction_id, body.client_secret)
    if (!userId) throw new AuthError('invalid_desktop_transaction', 'This desktop sign-in request is invalid, expired, or already used.', 400)
    const issued = await services.database.transaction(async (db) => services.sessions.issue(new AuthRepository(db), userId))
    set.headers['cache-control'] = 'no-store'
    return { token: issued.token }
  }, { body: desktopTransactionSchema, response: { 200: t.Object({ token: t.String() }), 400: detailSchema, 403: detailSchema, 503: detailSchema } })

  app.post('/auth/desktop/complete', async ({ request, body, set }) => {
    webBrowserOrigin(request)
    if (!services.desktopAuth) throw new AuthError('desktop_auth_unavailable', 'Desktop sign-in is unavailable.', 503)
    const token = cookieValue(request, settings.sessionCookieName)
    if (!token) throw new AuthError('unauthorized', 'Sign in to continue.', 401)
    const active = await services.database.transaction(async (db) => {
      const session = await services.sessions.resolve(new AuthRepository(db), token)
      if (!session) throw new AuthError('unauthorized', 'Sign in to continue.', 401)
      return session
    })
    const userId = active.user?.id
    if (!userId) throw new AuthError('unauthorized', 'Sign in to continue.', 401)
    const result = await services.desktopAuth.complete(body.transaction_id, userId)
    set.headers['cache-control'] = 'no-store'
    return { callback_url: result.callbackUrl }
  }, { body: desktopCompletionBodySchema, response: { 200: desktopCompletionSchema, 400: detailSchema, 401: detailSchema, 403: detailSchema, 503: detailSchema } })

  app.post('/auth/otp/request', async ({ request, body, set }) => {
    webBrowserOrigin(request)
    const challenge = await services.otp.issue(normalizeEmail(body.email), clientIp(request, peerResolver))
    set.status = 202
    set.headers['cache-control'] = 'no-store'
    return {
      challenge_id: challenge.challengeId,
      expires_in_seconds: challenge.expiresInSeconds,
      resend_after_seconds: challenge.resendAfterSeconds,
      ...(settings.environment === 'development' && challenge.developmentCode
        ? { development_code: challenge.developmentCode }
        : {}),
    }
  }, { body: otpRequestBody, response: otpRequestResponses })

  app.post('/auth/otp/verify', async ({ request, body, set }) => {
    webBrowserOrigin(request)
    const reservation = await services.otp.reserve(body.challenge_id, body.code, clientIp(request, peerResolver))
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

  app.get('/auth/google/start', async ({ request, set }) => {
    const result = await services.google.start()
    set.status = 303
    set.headers.Location = result.url
    const transactionId = new URL(request.url).searchParams.get('desktop_transaction')
    set.headers['set-cookie'] = [oauthStateCookie(result.state), ...(transactionId && /^[A-Za-z0-9_-]{32,64}$/.test(transactionId)
      ? [`${desktopTransactionCookieName}=${encodeURIComponent(transactionId)}; Max-Age=600; Path=/; HttpOnly; SameSite=Lax${settings.secureCookies ? '; Secure' : ''}`]
      : [])] as any
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
      const transactionId = cookieValue(request, desktopTransactionCookieName)
      set.status = 303
      set.headers.Location = transactionId
        ? `${settings.webOrigin}/sign?desktop_transaction=${encodeURIComponent(transactionId)}`
        : `${settings.webOrigin}/`
      set.headers['set-cookie'] = [services.sessions.cookie(issued.token), clearOauthStateCookie(), `${desktopTransactionCookieName}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`] as any
      return undefined
    } catch {
      set.status = 303
      const transactionId = cookieValue(request, desktopTransactionCookieName)
      set.headers.Location = transactionId
        ? `${settings.webOrigin}/sign?desktop_transaction=${encodeURIComponent(transactionId)}&error=google`
        : `${settings.webOrigin}/login?error=google`
      set.headers['set-cookie'] = [clearOauthStateCookie(), ...(transactionId ? [`${desktopTransactionCookieName}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`] : [])] as any
      return undefined
    }
  }, { response: { 303: t.Void() } })

  app.get('/auth/github/callback', async ({ request, set }) => {
    if (!services.github) throw new AuthError('github_unavailable', 'GitHub connection is unavailable.', 503)
    const url = new URL(request.url)
    const query = Object.fromEntries(url.searchParams.entries())
    const signed = cookieValue(request, githubOauthStateCookieName)
    try {
      const state = verifySignedValue(signed, settings.sessionSecret)
      const hasSession = Boolean(
        request.headers.get('authorization') || cookieValue(request, settings.sessionCookieName),
      )
      const expectedUserId = hasSession ? (await sessionUser(request)).id : undefined
      await services.github.completeCallback(query, state, expectedUserId)
      set.status = 303
      set.headers.Location = `${settings.webOrigin}/?github=connected`
    } catch {
      set.status = 303
      set.headers.Location = `${settings.webOrigin}/?github=error`
    }
    set.headers['set-cookie'] = clearGithubOauthStateCookie()
    return undefined
  }, { response: { 303: t.Void(), 503: detailSchema } })

  app.get('/auth/session', async ({ request }) => {
    const token = bearerValue(request) ?? cookieValue(request, settings.sessionCookieName)
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
    const bearer = bearerValue(request)
    if (!bearer) browserOrigin(request)
    const token = bearer ?? cookieValue(request, settings.sessionCookieName)
    if (token) {
      await services.database.transaction(async (db) => {
        const repository = new AuthRepository(db)
        const session = await services.sessions.resolve(repository, token)
        if (bearer && !session) throw new AuthError('unauthorized', 'Sign in to continue.', 401)
        if (session) await repository.revokeSession(session.id)
      })
    }
    return new Response(null, { status: 204, headers: { 'Set-Cookie': services.sessions.clearCookie() } })
  }, { response: { 204: t.Void(), 403: detailSchema } })

  const conversationParams = t.Object({
    conversationId: t.String({ format: 'uuid' }),
  })
  const runParams = t.Object({
    runId: t.String({ format: 'uuid' }),
  })
  const projectBody = t.Object({
    name: t.String({ minLength: 1, maxLength: 80 }),
  })
  const conversationTitleBody = t.Object({
    title: t.String({ minLength: 1, maxLength: 120 }),
  })
  const preferenceBody = t.Object({
    model: modelSchema,
    reasoning_effort: t.Optional(t.Union([
      t.Literal('none'),
      t.Literal('low'),
      t.Literal('medium'),
      t.Literal('high'),
      t.Literal('xhigh'),
      t.Literal('max'),
    ])),
    speed: t.Optional(t.Union([t.Literal('standard'), t.Literal('fast')])),
  })
  const resolvePreferenceBody = (
    model: string,
    current: { reasoningEffort: string; speed: string },
    requested: { reasoning_effort?: string; speed?: string },
  ) => {
    const definition = modelDefinition(model)
    if (!definition) return undefined
    const reasoningEfforts = definition.reasoningEfforts as readonly string[]
    const processingModes = definition.processingModes as readonly string[]
    return {
      model: definition.id,
      reasoningEffort: requested.reasoning_effort ?? (
        reasoningEfforts.includes(current.reasoningEffort)
          ? current.reasoningEffort
          : definition.defaultReasoningEffort
      ),
      speed: requested.speed ?? (
        processingModes.includes(current.speed)
          ? current.speed
          : definition.defaultProcessingMode
      ),
    }
  }
  const projectOrderBody = t.Object({
    project_ids: t.Array(t.String({ format: 'uuid' })),
  })
  const assignProjectBody = t.Object({
    project_id: t.Union([t.String({ format: 'uuid' }), t.Null()]),
  })
  const pinBody = t.Object({ pinned: t.Boolean() })
  const pinnedOrderBody = t.Object({
    conversation_ids: t.Array(t.String({ format: 'uuid' })),
  })
  const turnBody = t.Object({
    retry_of: t.Optional(t.String({ format: 'uuid' })),
    message: t.String({ minLength: 1, maxLength: 1_048_576 }),
    model: t.Optional(modelSchema),
    reasoning_effort: t.Union([
      t.Literal('none'),
      t.Literal('low'),
      t.Literal('medium'),
      t.Literal('high'),
      t.Literal('xhigh'),
      t.Literal('max'),
    ]),
    speed: t.Union([t.Literal('standard'), t.Literal('fast')]),
  })
  const sessionUser = async (request: Request) => {
    const token = bearerValue(request) ?? cookieValue(request, settings.sessionCookieName)
    return services.database.transaction(async (db) => {
      const active = await services.sessions.resolve(new AuthRepository(db), token)
      if (!active) throw new AuthError('unauthorized', 'Sign in to continue.', 401)
      return active.user!
    })
  }
  const providerConnectionRegistration = (connectionId: string) => {
    const registrations = services.providerConnectionAdapters ?? {}
    if (!Object.hasOwn(registrations, connectionId)) {
      throw new AuthError('not_found', 'Not Found', 404)
    }
    return registrations[connectionId]!
  }
  const providerConnectionAdapter = (connectionId: string) => {
    const registration = providerConnectionRegistration(connectionId)
    if (!registration.adapter) {
      throw new AuthError(
        'provider_connection_unavailable',
        'This provider connection is not configured on this server.',
        503,
      )
    }
    return registration.adapter
  }
  const providerConnectionCall = async <T>(operation: () => Promise<T>) => {
    try {
      return await operation()
    } catch (error) {
      if (error instanceof ProviderConnectionError) {
        throw new AuthError(error.code, error.message, error.status)
      }
      throw error
    }
  }
  const resolvedProviderConnection = async (
    userId: string,
    registration: ProviderConnectionRegistry[string],
  ) => {
    if (!registration.adapter) {
      return publicProviderConnection({
        status: 'unavailable',
        loginMode: registration.loginMode,
        account: null,
        limits: null,
      }, false)
    }
    const connection = await providerConnectionCall(() =>
      registration.adapter!.connection(userId))
    const active = connection.status === 'connected'
      ? await services.providerConnectionSettings?.isActive(userId, registration.provider) ?? true
      : false
    return publicProviderConnection(connection, active)
  }

  const publicRun = (run: AgentRun) => ({
    id: run.id,
    workspace_id: run.workspaceId,
    working_directory: run.workingDirectory,
    conversation_id: run.conversationId,
    turn_id: run.turnId,
    status: run.status,
    model: run.model,
    provider: run.provider,
    reasoning_effort: run.reasoningEffort,
    speed: run.speed,
    plan: run.plan,
    browser_projection: run.browserProjection,
    last_event_sequence: run.lastEventSequence?.toString() ?? null,
    cancel_requested_at: run.cancelRequestedAt?.toISOString() ?? null,
    started_at: run.startedAt?.toISOString() ?? null,
    completed_at: run.completedAt?.toISOString() ?? null,
    created_at: run.createdAt.toISOString(),
    updated_at: run.updatedAt.toISOString(),
  })
  const activeRunProjection = (run: AgentRun) => ({
    id: run.id,
    conversation_id: run.conversationId,
    turn_id: run.turnId,
    status: run.status,
    last_event_sequence: run.lastEventSequence?.toString() ?? null,
    plan: run.plan,
    browser_projection: run.browserProjection,
    model: run.model,
    provider: run.provider,
    reasoning_effort: run.reasoningEffort,
    speed: run.speed,
  })

  app.get('/models', async ({ request }) => {
    await sessionUser(request)
    return publicModelCatalog()
  })

  app.patch('/preferences/model', async ({ request, body }) => {
    browserOrigin(request)
    const user = await sessionUser(request)
    const preferences = resolvePreferenceBody(body.model, {
      reasoningEffort: user.defaultReasoningEffort,
      speed: user.defaultSpeed,
    }, body)
    if (!preferences || !validModelSelection(
      preferences.model,
      preferences.reasoningEffort,
      preferences.speed,
    )) {
      throw new AuthError(
        'invalid_model_options',
        'The selected reasoning effort or processing mode is not available for this model.',
        400,
      )
    }
    const updated = await services.database.transaction(async (db) => {
      return new AuthRepository(db).updateDefaultPreferences(user.id, {
        model: preferences.model,
        reasoningEffort: preferences.reasoningEffort,
        speed: preferences.speed,
      })
    })
    if (!updated) throw new AuthError('not_found', 'Not Found', 404)
    return userResponse(updated)
  }, { body: preferenceBody })

  const connectionParams = t.Object({
    connectionId: t.String({ minLength: 1, maxLength: 100 }),
  })
  const connectionLoginParams = t.Object({
    connectionId: t.String({ minLength: 1, maxLength: 100 }),
    loginId: t.String({ minLength: 1, maxLength: 200 }),
  })

  app.get(
    '/provider-connections',
    async ({ request, set }) => {
      set.headers['cache-control'] = 'no-store'
      const user = await sessionUser(request)
      const registrations = Object.entries(services.providerConnectionAdapters ?? {})
      const connections = await Promise.all(registrations.map(async ([connectionId, registration]) => ({
        connection_id: connectionId,
        provider: registration.provider,
        ...await resolvedProviderConnection(user.id, registration),
      })))
      return { connections }
    },
    {
      response: {
        200: t.Object({ connections: t.Array(providerConnectionSummarySchema) }),
        401: detailSchema,
      },
    },
  )

  app.get(
    '/provider-connections/:connectionId',
    async ({ request, params, set }) => {
      set.headers['cache-control'] = 'no-store'
      const user = await sessionUser(request)
      const registration = providerConnectionRegistration(params.connectionId)
      return resolvedProviderConnection(user.id, registration)
    },
    {
      params: connectionParams,
      response: { 200: providerConnectionSchema, 401: detailSchema, 404: detailSchema },
    },
  )

  app.post(
    '/provider-connections/:connectionId/logins',
    async ({ request, params, set }) => {
      browserOrigin(request)
      const user = await sessionUser(request)
      const adapter = providerConnectionAdapter(params.connectionId)
      const login = await providerConnectionCall(() => adapter.startLogin(user.id))
      set.status = 202
      set.headers['cache-control'] = 'no-store'
      if (login.type === 'browser' && login.state) set.headers['set-cookie'] = githubOauthStateCookie(login.state)
      return login.type === 'browser'
        ? { type: login.type, login_id: login.loginId, auth_url: login.authUrl }
        : {
            type: login.type,
            login_id: login.loginId,
            verification_url: login.verificationUrl,
            user_code: login.userCode,
          }
    },
    {
      params: connectionParams,
      response: {
        202: providerLoginSchema,
        401: detailSchema,
        403: detailSchema,
        409: detailSchema,
        503: detailSchema,
      },
    },
  )

  app.get(
    '/provider-connections/:connectionId/logins/:loginId',
    async ({ request, params, set }) => {
      set.headers['cache-control'] = 'no-store'
      const user = await sessionUser(request)
      const registration = providerConnectionRegistration(params.connectionId)
      const adapter = providerConnectionAdapter(params.connectionId)
      const result = await providerConnectionCall(() =>
        adapter.loginStatus(user.id, params.loginId),
      )
      if (result.status === 'connected') {
        const active = await services.providerConnectionSettings
          ?.setActive(user.id, registration.provider, true) ?? true
        return {
          status: result.status,
          connection: publicProviderConnection(result.connection, active),
        }
      }
      if (result.status === 'failed')
        return { status: result.status, message: result.message }
      return { status: result.status }
    },
    {
      params: connectionLoginParams,
      response: {
        200: providerLoginStatusSchema,
        401: detailSchema,
        404: detailSchema,
        503: detailSchema,
      },
    },
  )

  app.delete(
    '/provider-connections/:connectionId/logins/:loginId',
    async ({ request, params }) => {
      browserOrigin(request)
      const user = await sessionUser(request)
      const adapter = providerConnectionAdapter(params.connectionId)
      await providerConnectionCall(() => adapter.cancelLogin(user.id, params.loginId))
      return new Response(null, { status: 204 })
    },
    {
      params: connectionLoginParams,
      response: {
        204: t.Void(),
        401: detailSchema,
        403: detailSchema,
        404: detailSchema,
        503: detailSchema,
      },
    },
  )

  app.delete(
    '/provider-connections/:connectionId',
    async ({ request, params }) => {
      browserOrigin(request)
      const user = await sessionUser(request)
      const registration = providerConnectionRegistration(params.connectionId)
      const adapter = providerConnectionAdapter(params.connectionId)
      await providerConnectionCall(() => adapter.disconnect(user.id))
      await services.providerConnectionSettings?.setActive(user.id, registration.provider, false)
      return new Response(null, { status: 204 })
    },
    {
      params: connectionParams,
      response: {
        204: t.Void(),
        401: detailSchema,
        403: detailSchema,
        503: detailSchema,
      },
    },
  )

  app.patch(
    '/provider-connections/:connectionId',
    async ({ request, params, body }) => {
      browserOrigin(request)
      const user = await sessionUser(request)
      const registration = providerConnectionRegistration(params.connectionId)
      const adapter = providerConnectionAdapter(params.connectionId)
      const connection = await providerConnectionCall(() => adapter.connection(user.id))
      if (connection.status !== 'connected') {
        throw new AuthError(
          'provider_not_connected',
          'Connect this provider before changing its active state.',
          409,
        )
      }
      if (!services.providerConnectionSettings) {
        throw new AuthError(
          'provider_settings_unavailable',
          'Provider settings are unavailable on this server.',
          503,
        )
      }
      const active = await services.providerConnectionSettings
        .setActive(user.id, registration.provider, body.active)
      return publicProviderConnection(connection, active)
    },
    {
      body: providerConnectionStateBody,
      params: connectionParams,
      response: {
        200: providerConnectionSchema,
        401: detailSchema,
        403: detailSchema,
        409: detailSchema,
        503: detailSchema,
      },
    },
  )

  app.get('/projects', async ({ request }) => {
    const user = await sessionUser(request)
    return services.database.transaction(async (db) => ({
      projects: (await new ProjectRepository(db).list(user.id)).map(publicProject),
    }))
  })

  app.post('/projects', async ({ request, body, set }) => {
    browserOrigin(request)
    const user = await sessionUser(request)
    const name = normalizeProjectName(body.name)
    const slug = projectSlug(name)
    if (!slug) {
      throw new AuthError(
        'invalid_project_name',
        'Use at least one letter or number in the project name.',
        400,
      )
    }
    const project = await services.database.transaction(async (db) => {
      const repository = new ProjectRepository(db)
      await repository.lockUser(user.id)
      return repository.create(user.id, name, slug)
    })
    if (!project) {
      throw new AuthError(
        'project_exists',
        'A project with this name already exists.',
        409,
      )
    }
    set.status = 201
    return publicProject(project)
  }, { body: projectBody })

  const projectParams = t.Object({
    projectId: t.String({ format: 'uuid' }),
  })

  app.patch('/projects/:projectId', async ({ request, params, body, set }) => {
    browserOrigin(request)
    const user = await sessionUser(request)
    const name = normalizeProjectName(body.name)
    const slug = projectSlug(name)
    if (!slug) {
      throw new AuthError(
        'invalid_project_name',
        'Use at least one letter or number in the project name.',
        400,
      )
    }

    try {
      const project = await services.database.transaction(async (db) => {
        const repository = new ProjectRepository(db)
        if (!await repository.get(user.id, params.projectId)) return undefined
        return repository.rename(user.id, params.projectId, name, slug)
      })
      if (!project) {
        set.status = 404
        return { detail: { code: 'not_found', message: 'Not Found' } }
      }
      return publicProject(project)
    } catch (error) {
      if (constraintName(error) === 'uq_projects_user_id_slug') {
        throw new AuthError(
          'project_exists',
          'A project with this name already exists.',
          409,
        )
      }
      throw error
    }
  }, { params: projectParams, body: projectBody })

  app.delete('/projects/:projectId', async ({ request, params, set }) => {
    browserOrigin(request)
    const user = await sessionUser(request)
    const project = await services.database.transaction(async (db) => {
      const repository = new ProjectRepository(db)
      await repository.lockUser(user.id)
      return repository.delete(user.id, params.projectId)
    })
    if (!project) {
      set.status = 404
      return { detail: { code: 'not_found', message: 'Not Found' } }
    }
    return new Response(null, { status: 204 })
  }, { params: projectParams })

  app.patch('/projects/order', async ({ request, body }) => {
    browserOrigin(request)
    const user = await sessionUser(request)
    const projects = await services.database.transaction(async (db) => {
      const repository = new ProjectRepository(db)
      await repository.lockUser(user.id)
      try {
        return await repository.reorder(user.id, body.project_ids)
      } catch (error) {
        if (error instanceof ProjectOrderError) {
          throw new AuthError('invalid_project_order', 'The project set is stale or invalid.', 409)
        }
        throw error
      }
    })
    return { projects: projects.map(publicProject) }
  }, { body: projectOrderBody })

  app.get('/conversations', async ({ request }) => {
    const user = await sessionUser(request)
    return services.database.transaction(async (db) => ({
      conversations: (await new ConversationRepository(db).list(user.id)).map(publicConversation),
    }))
  })

  app.get('/conversations/:conversationId', async ({ request, params, set }) => {
    const user = await sessionUser(request)
    const result = await services.database.transaction(async (db) => {
      const conversation = await new ConversationRepository(db).get(user.id, params.conversationId)
      if (!conversation) return undefined
      const runs = new AgentRunRepository(db)
      const [activeRun, plan] = await Promise.all([
        runs.activeForConversation(conversation.id),
        runs.taskPlanFor(user.id, conversation.id),
      ])
      return { conversation, activeRun, plan }
    }, { isolationLevel: 'repeatable read' })
    if (!result) {
      set.status = 404
      return { detail: { code: 'not_found', message: 'Not Found' } }
    }
    return {
      ...publicConversation(result.conversation),
      messages: result.conversation.messages.map(publicMessage),
      plan: result.plan,
      active_run: result.activeRun ? activeRunProjection(result.activeRun) : null,
    }
  }, { params: conversationParams })

  app.patch('/conversations/:conversationId', async ({ request, params, body, set }) => {
    browserOrigin(request)
    const user = await sessionUser(request)
    const title = body.title.trim().replace(/\s+/g, ' ').slice(0, 120)
    if (!title) {
      throw new AuthError('invalid_title', 'Enter a title to continue.', 400)
    }
    const conversation = await services.database.transaction((db) =>
      new ConversationRepository(db).rename(user.id, params.conversationId, title))
    if (!conversation) {
      set.status = 404
      return { detail: { code: 'not_found', message: 'Not Found' } }
    }
    return publicConversation(conversation)
  }, { params: conversationParams, body: conversationTitleBody })

  app.patch('/conversations/:conversationId/model', async ({ request, params, body, set }) => {
    browserOrigin(request)
    const user = await sessionUser(request)
    const conversation = await services.database.transaction(async (db) => {
      const repository = new ConversationRepository(db)
      const owned = await repository.lockOwned(user.id, params.conversationId)
      if (!owned) return undefined
      const preferences = resolvePreferenceBody(body.model, {
        reasoningEffort: owned.reasoningEffort,
        speed: owned.speed,
      }, body)
      if (!preferences || !validModelSelection(
        preferences.model,
        preferences.reasoningEffort,
        preferences.speed,
      )) {
        throw new AuthError(
          'invalid_model_options',
          'The selected reasoning effort or processing mode is not available for this model.',
          400,
        )
      }
      if (
        owned.model === preferences.model &&
        owned.reasoningEffort === preferences.reasoningEffort &&
        owned.speed === preferences.speed
      ) return owned
      return repository.updatePreferences(user.id, owned, preferences)
    })
    if (!conversation) {
      set.status = 404
      return { detail: { code: 'not_found', message: 'Not Found' } }
    }
    return publicConversation(conversation)
  }, { params: conversationParams, body: preferenceBody })

  app.delete('/conversations/:conversationId', async ({ request, params, set }) => {
    browserOrigin(request)
    const user = await sessionUser(request)
    const deleted = await services.database.transaction(async (db) => {
      const repository = new ConversationRepository(db)
      await repository.lockUser(user.id)
      const owned = await repository.lockOwned(user.id, params.conversationId)
      if (!owned) return undefined
      if (await repository.active(owned.id)) {
        throw new AuthError(
          'conversation_active',
          'This conversation has an active turn.',
          409,
        )
      }
      return repository.delete(user.id, owned.id)
    })
    if (!deleted) {
      set.status = 404
      return { detail: { code: 'not_found', message: 'Not Found' } }
    }
    return new Response(null, { status: 204 })
  }, { params: conversationParams })

  app.patch('/conversations/:conversationId/pin', async ({ request, params, body, set }) => {
    browserOrigin(request)
    const user = await sessionUser(request)
    const conversation = await services.database.transaction(async (db) => {
      const repository = new ConversationRepository(db)
      await repository.lockUser(user.id)
      return repository.pin(user.id, params.conversationId, body.pinned)
    })
    if (!conversation) {
      set.status = 404
      return { detail: { code: 'not_found', message: 'Not Found' } }
    }
    return publicConversation(conversation)
  }, { params: conversationParams, body: pinBody })

  app.patch('/conversations/pinned-order', async ({ request, body }) => {
    browserOrigin(request)
    const user = await sessionUser(request)
    const conversations = await services.database.transaction(async (db) => {
      const repository = new ConversationRepository(db)
      await repository.lockUser(user.id)
      try {
        return await repository.reorderPins(user.id, body.conversation_ids)
      } catch (error) {
        if (error instanceof ConversationPinError && error.code === 'invalid_reorder') {
          throw new AuthError('invalid_pinned_order', 'The pinned conversation set is stale or invalid.', 409)
        }
        throw error
      }
    })
    return { conversations: conversations.map(publicConversation) }
  }, { body: pinnedOrderBody })

  app.patch('/conversations/:conversationId/project', async ({ request, params, body, set }) => {
    browserOrigin(request)
    const user = await sessionUser(request)
    const conversation = await services.database.transaction(async (db) => {
      const projectRepository = new ProjectRepository(db)
      const conversationRepository = new ConversationRepository(db)
      await conversationRepository.lockUser(user.id)
      const projectId = body.project_id
      if (projectId !== null && !await projectRepository.get(user.id, projectId)) {
        return undefined
      }
      try {
        return await conversationRepository.assignProject(user.id, params.conversationId, projectId)
      } catch (error) {
        if (error instanceof ConversationPinError && error.code === 'project_pinned') {
          throw new AuthError('project_pinned', 'Unpin the conversation before moving it between projects or Recents.', 409)
        }
        throw error
      }
    })
    if (!conversation) {
      set.status = 404
      return { detail: { code: 'not_found', message: 'Not Found' } }
    }
    return publicConversation(conversation)
  }, { params: conversationParams, body: assignProjectBody })

  const constraintName = (error: unknown): string => {
    if (!error || typeof error !== 'object') return ''
    const candidate = error as { constraint?: unknown; cause?: unknown }
    if (candidate.constraint) return String(candidate.constraint)
    return constraintName(candidate.cause)
  }

  const beginTurn = async (
    request: Request,
    user: User,
    options: TurnOptions,
    conversationId?: string,
  ) => {
    const context = requestContexts.get(request)
    if (context) context.userId = user.id
    const message = options.message.trim()
    if (!message) throw new AuthError('invalid_message', 'Enter a message to continue.', 400)
    if (options.retry_of && !conversationId) {
      throw new AuthError('retry_unavailable', 'Open the conversation before retrying this response.', 409)
    }
    try {
      const result = await services.database.transaction(async (db) => {
        const repository = new ConversationRepository(db)
        let conversation = conversationId
          ? await repository.lockOwned(user.id, conversationId)
          : undefined
        const requestedModel = options.model ?? (conversation?.model || user.defaultModel)
        const definition = modelDefinition(requestedModel)
        if (!definition || !validModelSelection(
          definition.id,
          options.reasoning_effort,
          options.speed,
        )) {
          throw new AuthError(
            'invalid_model_options',
            'The selected reasoning effort or processing mode is not available for this model.',
            400,
          )
        }
        if (!conversationId) {
          conversation = await repository.create(user.id, conversationTitle(message), {
            model: definition.id,
            reasoningEffort: options.reasoning_effort,
            speed: options.speed,
          })
          if (
            user.defaultModel !== definition.id ||
            user.defaultReasoningEffort !== options.reasoning_effort ||
            user.defaultSpeed !== options.speed
          ) {
            await new AuthRepository(db).updateDefaultPreferences(user.id, {
              model: definition.id,
              reasoningEffort: options.reasoning_effort,
              speed: options.speed,
            })
          }
        } else if (conversation && (
          conversation.model !== definition.id ||
          conversation.reasoningEffort !== options.reasoning_effort ||
          conversation.speed !== options.speed
        )) {
          conversation = await repository.updatePreferences(user.id, conversation, {
            model: definition.id,
            reasoningEffort: options.reasoning_effort,
            speed: options.speed,
          })
        }
        if (!conversation) throw new AuthError('not_found', 'Not Found', 404)
        const modelOptions = {
          model: definition.id,
          reasoningEffort: options.reasoning_effort,
          speed: options.speed,
        }
        const created = options.retry_of
          ? await repository.retryTurn(conversation.id, options.retry_of, message, modelOptions)
          : await repository.addTurn(conversation.id, message, modelOptions)
        const resolvedConversation = created.conversation ?? conversation
        const runs = new AgentRunRepository(db)
        const queued = await runs.create({
          id: crypto.randomUUID(),
          turnId: crypto.randomUUID(),
          userId: user.id,
          conversationId: resolvedConversation.id,
          assistantMessageId: created.assistant.id,
          model: definition.id,
          provider: definition.provider,
          reasoningEffort: options.reasoning_effort,
          speed: options.speed,
        })
        const run = await runs.claim(queued.id)
        if (!run) throw new Error('agent_run_claim_failed')
        const event = await runs.appendEvent(run, 'turn.started', {
          conversation: publicConversation(resolvedConversation),
          user_message: publicMessage(created.user),
          assistant_message: publicMessage(created.assistant),
          plan: run.plan,
        })
        return { run, event }
      })
      if (context) {
        context.conversationId = result.run.conversationId
        context.turnId = result.run.turnId
      }
      await agentExecutor.publishCommitted(result.event)
      agentExecutor.startClaimed(result.run, requestHeaders(requestIdsFor(request)))
      return agentExecutor.stream(result.run.id)
    } catch (error) {
      if (error instanceof AuthError) throw error
      if (error instanceof Error && error.message === 'retry_unavailable') {
        throw new AuthError('retry_unavailable', 'This response can no longer be retried. Refresh the conversation to see its latest state.', 409)
      }
      if (
        constraintName(error) === 'uq_messages_one_streaming_assistant' ||
        (error instanceof Error && error.message === 'conversation_active')
      ) {
        throw new AuthError(
          'conversation_active',
          'This conversation has an active turn.',
          409,
        )
      }
      throw error
    }
  }

  app.post('/conversations/turns', async ({ request, body }) => {
    browserOrigin(request)
    const user = await sessionUser(request)
    return beginTurn(request, user, body)
  }, { body: turnBody })

  app.post('/conversations/:conversationId/turns', async ({ request, params, body }) => {
    browserOrigin(request)
    const user = await sessionUser(request)
    return beginTurn(request, user, body, params.conversationId)
  }, { body: turnBody, params: conversationParams })

  app.get('/agent-runs', async ({ request }) => {
    const user = await sessionUser(request)
    const entries = await services.database.transaction((db) =>
      new AgentRunRepository(db).activeForUser(user.id))
    return {
      runs: entries.map(({ run }) => activeRunProjection(run)),
      conversations: entries.map(({ conversation }) => publicConversation(conversation)),
    }
  })

  app.get('/agent-runs/:runId', async ({ request, params, set }) => {
    const user = await sessionUser(request)
    const run = await services.database.transaction((db) =>
      new AgentRunRepository(db).getOwned(user.id, params.runId))
    if (!run) {
      set.status = 404
      return { detail: { code: 'not_found', message: 'Not Found' } }
    }
    return publicRun(run)
  }, { params: runParams })

  app.get('/agent-runs/:runId/events', async ({ request, params, set }) => {
    const user = await sessionUser(request)
    const cursorValue = new URL(request.url).searchParams.get('after') ?? '0'
    let after: bigint
    try {
      if (!/^\d+$/.test(cursorValue)) throw new Error('invalid')
      after = BigInt(cursorValue)
      if (after > 9_223_372_036_854_775_807n) throw new Error('overflow')
    } catch {
      throw new AuthError('invalid_cursor', 'The replay cursor is invalid.', 400)
    }
    const result = await services.database.transaction(async (db) => {
      const repository = new AgentRunRepository(db)
      const run = await repository.getOwned(user.id, params.runId)
      if (!run) return undefined
      const highWater = await repository.replayHighWater(run.id)
      const page = await repository.replayPage(run.id, after, highWater)
      return { run, page }
    })
    if (!result) {
      set.status = 404
      return { detail: { code: 'not_found', message: 'Not Found' } }
    }
    const events = result.page.events.map(publicAgentEvent)
    const nextCursor = events.at(-1)?.sequence ?? after.toString()
    return {
      events,
      has_more: result.page.hasMore,
      next_cursor: nextCursor,
      next_sequence: nextCursor,
    }
  }, { params: runParams })

  app.post('/agent-runs/:runId/cancel', async ({ request, params, set }) => {
    browserOrigin(request)
    const user = await sessionUser(request)
    const result = await services.database.transaction(async (db) => {
      const repository = new AgentRunRepository(db)
      const owned = await repository.getOwned(user.id, params.runId)
      if (!owned) return { kind: 'missing' as const }
      const run = await repository.requestCancellation(user.id, owned.id)
      return run ? { kind: 'cancelling' as const, run } : { kind: 'conflict' as const }
    })
    if (result.kind === 'missing') {
      set.status = 404
      return { detail: { code: 'not_found', message: 'Not Found' } }
    }
    if (result.kind === 'conflict') {
      throw new AuthError('run_terminal', 'This run has already finished.', 409)
    }
    agentExecutor.cancel(result.run.id, requestHeaders(requestIdsFor(request)))
    set.status = 202
    return publicRun(result.run)
  }, { params: runParams })

  // Key by socket object instead of provider-assigned ids so a recycled id
  // cannot overwrite another connection's cleanup callback.
  const socketSubscriptions = new WeakMap<object, () => void>()
  type ActiveRunDiscoveryMessage = {
    version: 2
    type: 'active_run.discovered'
    active_run: ReturnType<typeof activeRunProjection>
  }
  const activeRunDiscovery = (run: AgentRun): ActiveRunDiscoveryMessage => ({
    version: 2,
    type: 'active_run.discovered',
    active_run: activeRunProjection(run),
  })

  app.ws('/agent-runs/subscribe', {
    beforeHandle: async ({ request }) => {
      websocketOrigin(request)
      await sessionUser(request)
    },
    open: async (socket) => {
      // Elysia carries the upgrade request on websocket data; authentication is
      // repeated here so the user identity is available for event ownership checks.
      const request = (socket.data as unknown as { request: Request }).request
      const user = await sessionUser(request)
      let closed = false
      const discovered = new Set<string>()
      let replaying = true
      const buffered: AgentRun[] = []
      const send = (run: AgentRun) => {
        if (closed || discovered.has(run.id)) return
        discovered.add(run.id)
        socket.send(JSON.stringify(activeRunDiscovery(run)))
      }
      const receive = (event: ReturnType<typeof publicAgentEvent>) => {
        if (event.type !== 'turn.started') return
        void services.database.transaction((db) =>
          new AgentRunRepository(db).getOwned(user.id, event.run_id)
        ).then((run) => {
          if (closed || !run) return
          if (replaying) buffered.push(run)
          else send(run)
        }).catch(() => undefined)
      }
      const unsubscribe = agentExecutor.hub.subscribeAll(receive)
      socketSubscriptions.set(socket, () => {
        closed = true
        unsubscribe()
      })
      const entries = await services.database.transaction((db) =>
        new AgentRunRepository(db).activeForUser(user.id))
      for (const { run } of entries) send(run)
      // Events received while the snapshot was being read are emitted after it,
      // with run-id deduplication preserving exactly one discovery per run.
      replaying = false
      for (const run of buffered) send(run)
    },
    close: (socket) => {
      socketSubscriptions.get(socket)?.()
      socketSubscriptions.delete(socket)
    },
  })

  app.ws('/agent-runs/:runId/subscribe', {
    params: runParams,
    query: t.Object({ after: t.Optional(t.String()) }),
    beforeHandle: async ({ request, params }) => {
      websocketOrigin(request)
      const cursor = new URL(request.url).searchParams.get('after') ?? '0'
      try {
        if (!/^\d+$/.test(cursor) || BigInt(cursor) > 9_223_372_036_854_775_807n) throw new Error('invalid')
      } catch {
        throw new AuthError('invalid_cursor', 'The replay cursor is invalid.', 400)
      }
      const user = await sessionUser(request)
      const run = await services.database.transaction((db) =>
        new AgentRunRepository(db).getOwned(user.id, params.runId))
      if (!run) throw new AuthError('not_found', 'Not Found', 404)
    },
    open: async (socket) => {
      const runId = socket.data.params.runId
      const afterValue = socket.data.query.after ?? '0'
      const after = BigInt(afterValue)
      let cursor = after
      let replaying = true
      const buffered: ReturnType<typeof publicAgentEvent>[] = []
      const send = (event: ReturnType<typeof publicAgentEvent>) => {
        const sequence = BigInt(event.sequence)
        if (sequence <= cursor) return
        cursor = sequence
        socket.send(JSON.stringify(event))
      }
      const receive = (event: ReturnType<typeof publicAgentEvent>) => {
        if (replaying) buffered.push(event)
        else send(event)
      }
      const unsubscribeEvents = agentExecutor.hub.subscribe(runId, receive)
      const unsubscribeFrames = agentExecutor.hub.subscribeFrames(runId, (frame) => {
        socket.send(JSON.stringify({ version: 2, run_id: runId, type: 'browser.frame', data: frame }))
      })
      socketSubscriptions.set(socket, () => {
        unsubscribeEvents()
        unsubscribeFrames()
      })
      const highWater = await services.database.transaction((db) =>
        new AgentRunRepository(db).replayHighWater(runId))
      while (cursor < highWater) {
        const page = await services.database.transaction((db) =>
          new AgentRunRepository(db).replayPage(runId, cursor, highWater))
        for (const event of page.events) send(publicAgentEvent(event))
        if (!page.hasMore) break
      }
      while (buffered.length) {
        const batch = buffered.splice(0).sort((left, right) =>
          BigInt(left.sequence) < BigInt(right.sequence) ? -1 : 1)
        for (const event of batch) send(event)
      }
      replaying = false
    },
    close: (socket) => {
      socketSubscriptions.get(socket)?.()
      socketSubscriptions.delete(socket)
    },
  })

  return app
}
