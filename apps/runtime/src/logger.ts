import { randomUUID } from 'node:crypto'
import pino, { type DestinationStream, type Logger } from 'pino'
import { RuntimeError } from './errors.js'

type Category =
  | 'validation'
  | 'authentication'
  | 'not_found'
  | 'conflict'
  | 'dependency'
  | 'provider'
  | 'persistence'
  | 'cancelled'
  | 'unknown'
const summaries: Record<Category, string> = {
  validation: 'The request was invalid.',
  authentication: 'Authentication was rejected.',
  not_found: 'The requested resource was not found.',
  conflict: 'The operation conflicted with current state.',
  dependency: 'A required dependency was unavailable.',
  provider: 'The provider operation failed.',
  persistence: 'The operation could not be persisted.',
  cancelled: 'The operation was cancelled.',
  unknown: 'An unexpected error occurred.',
}
const denied = new Set([
  'authorization', 'cookie', 'token', 'secret', 'password', 'body', 'content',
  'prompt', 'stdout', 'stderr', 'command', 'argv', 'cwd', 'path', 'filepath',
  'workingdirectory', 'headers', 'message', 'errormessage', 'rawmessage',
  'providerbody', 'sql',
])
const sanitize = (value: unknown, seen = new WeakSet<object>()): unknown => {
  if (!value || typeof value !== 'object') return value
  if (seen.has(value)) return '[Circular]'
  seen.add(value)
  if (Array.isArray(value)) return value.map((item) => sanitize(item, seen))
  const result: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (!denied.has(key.toLowerCase().replace(/[-_]/g, ''))) {
      result[key] = sanitize(item, seen)
    }
  }
  return result
}
type LogLevel = 'info' | 'warn' | 'error'
export const createRuntimeLogger = (
  environment: 'development' | 'production',
  destination?: DestinationStream,
): Logger => pino({
  level: environment === 'production' ? 'info' : 'debug',
  base: { service: 'my_bot_runtime', environment, schema_version: 1 },
  messageKey: 'message',
  timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
  formatters: {
    level: (label) => ({ level: label }),
  },
  hooks: {
    logMethod(inputArgs, method) {
      for (let index = 0; index < inputArgs.length; index += 1) {
        const value = inputArgs[index]
        if (value !== null && typeof value === 'object') inputArgs[index] = sanitize(value)
      }
      method.apply(this, inputArgs)
    },
  },
  ...(environment === 'development'
    ? { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } } }
    : {}),
}, destination)

const logger = createRuntimeLogger(
  process.env.NODE_ENV === 'production' ? 'production' : 'development',
)

export const diagnostic = (error: unknown, status?: number, codeOverride?: string) => {
  const code = codeOverride ?? (error instanceof RuntimeError ? error.code : '')
  const category: Category =
    status === 401 ? 'authentication'
      : status === 404 ? 'not_found'
        : status === 409 ? 'conflict'
          : status === 400 || status === 413 ? 'validation'
            : status === 503 || code === 'runtime_unavailable' ? 'dependency'
              : code === 'operation_failed' || status === 502 ? 'provider'
                : code === 'manual_recovery_required' ? 'conflict' : 'unknown'
  return {
    error_category: category,
    error_code: code || 'unknown_error',
    error_summary: summaries[category],
    retryable: category === 'dependency' || category === 'provider' || category === 'unknown',
  }
}
export const runtimeLogger = (
  fields: Record<string, unknown>,
  message: string,
  level: LogLevel = 'info',
) => {
  const safeMessage = /^[a-z][a-z0-9_.:-]{0,79}$/.test(message) ? message : 'runtime_event'
  logger[level](fields, safeMessage)
}
export const requestIdentity = (
  headers: { [key: string]: string | string[] | undefined },
) => {
  const requestId = headers['x-request-id']
  const correlationId = headers['x-correlation-id']
  const validId = (value: unknown): value is string =>
    typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)
  return {
    request_id: validId(requestId) ? requestId : randomUUID(),
    correlation_id: validId(correlationId) ? correlationId : randomUUID(),
  }
}
