import pino, { type DestinationStream, type Logger } from 'pino'
import type { Settings } from './config.js'

export const REQUEST_ID_HEADER = 'x-request-id'
export const CORRELATION_ID_HEADER = 'x-correlation-id'

const idPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const deniedKeys = new Set([
  'authorization', 'cookie', 'set_cookie', 'set-cookie', 'token', 'api_key', 'api-key',
  'service_token', 'service-token', 'password', 'secret', 'otp', 'oauth_state', 'oauth-state',
  'state', 'email', 'body', 'request_body', 'request-body', 'response_body', 'response-body',
  'prompt', 'message', 'content', 'reasoning',
])

export type RequestContext = {
  requestId: string
  correlationId: string
  startedAt: number
  httpMethod: string
  httpRoute?: string
  userId?: string
  conversationId?: string
  turnId?: string
  completed?: boolean
  error?: ReturnType<typeof classifyError> & { error_code?: string }
}

export type RequestOutcome = 'success' | 'error' | 'cancelled'
export type ErrorCategory = 'validation' | 'authentication' | 'not_found' | 'conflict' | 'dependency' | 'provider' | 'persistence' | 'cancelled' | 'unknown'
const errorSummaries: Record<ErrorCategory, string> = {
  validation: 'The request was invalid.', authentication: 'Authentication was rejected.', not_found: 'The requested resource was not found.',
  conflict: 'The operation conflicted with current state.', dependency: 'A required dependency was unavailable.', provider: 'The provider operation failed.',
  persistence: 'The operation could not be persisted.', cancelled: 'The operation was cancelled.', unknown: 'An unexpected error occurred.',
}

export const validRequestId = (value: string | null | undefined): value is string =>
  !!value && idPattern.test(value)

export const requestIds = (request: Request) => ({
  requestId: validRequestId(request.headers.get(REQUEST_ID_HEADER))
    ? request.headers.get(REQUEST_ID_HEADER)!
    : crypto.randomUUID(),
  correlationId: validRequestId(request.headers.get(CORRELATION_ID_HEADER))
    ? request.headers.get(CORRELATION_ID_HEADER)!
    : crypto.randomUUID(),
})

const requestIdState = new WeakMap<Request, { requestId: string; correlationId: string }>()
const requestOutcomeState = new WeakMap<Request, RequestOutcome>()
export const requestIdsFor = (request: Request) => {
  const existing = requestIdState.get(request)
  if (existing) return existing
  const ids = requestIds(request)
  requestIdState.set(request, ids)
  return ids
}

const isDeniedKey = (key: string, value: unknown) => {
  const normalized = key.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase().replace(/-/g, '_')
  if (normalized !== 'code') return deniedKeys.has(normalized)
  return typeof value !== 'string' || /^\d{4,8}$/.test(value) || value.length >= 16 || /secret|token|auth|otp/i.test(value)
}

export const sanitizeLogFields = (value: unknown, depth = 0, seen = new WeakSet<object>()): unknown => {
  if (value === null || typeof value !== 'object') return value
  if (seen.has(value)) return '[Circular]'
  seen.add(value)
  if (Array.isArray(value)) return value.map((item) => sanitizeLogFields(item, depth + 1, seen))
  if (value instanceof Date) return value.toISOString()
  const result: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (isDeniedKey(key, item)) continue
    result[key] = sanitizeLogFields(item, depth + 1, seen)
  }
  return result
}

export const classifyError = (error: unknown, status?: number): { error_category: ErrorCategory; error_summary: string; retryable: boolean } => {
  const code = error && typeof error === 'object' && typeof (error as { code?: unknown }).code === 'string' ? (error as { code: string }).code : ''
  const name = error instanceof Error ? error.name : ''
  const category: ErrorCategory = status === 422 || code === 'invalid_request' || name === 'ValidationError' || name === 'ParseError' ? 'validation'
    : status === 401 || status === 403 || code.includes('auth') || code === 'unauthorized' ? 'authentication'
      : status === 404 || code === 'not_found' || code === 'NOT_FOUND' ? 'not_found'
        : status === 409 || code.includes('conflict') || code.includes('recovery') ? 'conflict'
          : code.includes('provider') || code === 'operation_failed' ? 'provider'
            : code.includes('database') || code.includes('persist') ? 'persistence'
              : status === 503 || code.includes('unavailable') ? 'dependency'
                : status === 499 || name === 'AbortError' ? 'cancelled' : 'unknown'
  return { error_category: category, error_summary: errorSummaries[category], retryable: category === 'dependency' || category === 'provider' || category === 'unknown' }
}

export const safeError = (error: unknown, status?: number) => {
  const classified = classifyError(error, status)
  if (error instanceof Error) {
    const result: { error_name: string; error_code: string; error_stack?: string; error_category: ErrorCategory; error_summary: string; retryable: boolean } = { error_name: error.name, error_code: 'unknown_error', ...classified }
    const code = (error as { code?: unknown }).code
    if (typeof code === 'string' && /^[A-Za-z0-9_.:-]{1,80}$/.test(code)) result.error_code = code
    if (process.env.LOG_STACKS === 'true' && error.stack) result.error_stack = error.stack.split('\n').slice(1, 8).join('\n')
    return result
  }
  return { error_name: 'UnknownError', error_code: 'unknown_error', ...classified }
}

export const setRequestOutcome = (request: Request, outcome: RequestOutcome) => {
  requestOutcomeState.set(request, outcome)
}

export const requestOutcomeFor = (request: Request): RequestOutcome | undefined => requestOutcomeState.get(request)

export const createLogger = (
  settings: Pick<Settings, 'environment'>,
  destination?: DestinationStream,
): Logger => pino({
  level: settings.environment === 'production' ? 'info' : 'debug',
  base: { service: 'my_bot_api', environment: settings.environment, schema_version: 1 },
  messageKey: 'message',
  timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
  formatters: {
    level: (label) => ({ level: label }),
  },
  hooks: {
    logMethod(inputArgs, method) {
      for (let index = 0; index < inputArgs.length; index += 1) {
        const value = inputArgs[index]
        if (value instanceof Error) inputArgs[index] = safeError(value)
        else if (value !== null && typeof value === 'object') inputArgs[index] = sanitizeLogFields(value)
      }
      method.apply(this, inputArgs)
    },
  },
  ...(settings.environment === 'development'
    ? { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } } }
    : {}),
}, destination)

export const requestLogFields = (context: RequestContext) => ({
  request_id: context.requestId,
  correlation_id: context.correlationId,
  http_method: context.httpMethod,
  ...(context.httpRoute ? { http_route: context.httpRoute } : {}),
  ...(context.userId ? { user_id: context.userId } : {}),
  ...(context.conversationId ? { conversation_id: context.conversationId } : {}),
  ...(context.turnId ? { turn_id: context.turnId } : {}),
  ...(context.error ? context.error : undefined),
})

export const requestHeaders = (context: Pick<RequestContext, 'requestId' | 'correlationId'>) => ({
  [REQUEST_ID_HEADER]: context.requestId,
  [CORRELATION_ID_HEADER]: context.correlationId,
})

export const trackedResponse = (
  response: Response,
  complete: (statusCode: number, outcome: RequestOutcome) => void,
  request?: Request,
) => {
  if (!response.body) {
    complete(response.status, (request ? requestOutcomeFor(request) : undefined) ?? (response.status >= 400 ? 'error' : 'success'))
    return response
  }
  const reader = response.body.getReader()
  let finished = false
  const finish = (outcome: RequestOutcome) => {
    if (finished) return
    finished = true
    complete(response.status, outcome)
  }
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const part = await reader.read()
        if (part.done) {
          finish(request ? requestOutcomeFor(request) ?? (response.status >= 400 ? 'error' : 'success') : response.status >= 400 ? 'error' : 'success')
          controller.close()
        } else controller.enqueue(part.value)
      } catch {
        finish('error')
        controller.error()
      }
    },
    cancel(reason) {
      finish('cancelled')
      return reader.cancel(reason)
    },
  })
  return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers })
}
