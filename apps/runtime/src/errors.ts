export type RuntimeErrorCode =
  | 'invalid_request'
  | 'unauthorized'
  | 'not_found'
  | 'conflict'
  | 'idempotency_conflict'
  | 'manual_recovery_required'
  | 'runtime_unavailable'
  | 'operation_failed'

export class RuntimeError extends Error {
  readonly code: RuntimeErrorCode
  readonly status: number
  readonly retryable: boolean

  constructor(code: RuntimeErrorCode, message: string, status: number, retryable = false) {
    super(message)
    this.name = 'RuntimeError'
    this.code = code
    this.status = status
    this.retryable = retryable
  }
}

export class InvalidRequestError extends RuntimeError {
  constructor(message: string) {
    super('invalid_request', message, 400)
  }
}

export class RuntimeUnavailableError extends RuntimeError {
  constructor() {
    super('runtime_unavailable', 'The runtime is temporarily unavailable.', 503, true)
  }
}

export class ControlLeaseError extends RuntimeError {
  constructor(message = 'A valid browser control lease is required.') {
    super('conflict', message, 409)
  }
}

export class ConflictError extends RuntimeError {
  constructor(message: string) {
    super('conflict', message, 409)
  }
}

export class IdempotencyConflictError extends RuntimeError {
  constructor() {
    super('idempotency_conflict', 'The operation id is already bound to a different runtime operation.', 409)
  }
}

export class ManualRecoveryRequiredError extends RuntimeError {
  constructor(message = 'The previous operation outcome is ambiguous and requires manual recovery.') {
    super('manual_recovery_required', message, 409)
  }
}

export function toPublicError(error: unknown): RuntimeError {
  if (error instanceof RuntimeError) return error
  return new RuntimeError('operation_failed', 'The runtime operation failed.', 502, true)
}
