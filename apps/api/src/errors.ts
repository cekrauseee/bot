export class AuthError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message)
    this.name = 'AuthError'
  }
}

export const invalidCode = () => new AuthError(
  'invalid_code',
  'That code is incorrect or has expired. Request a new code and try again.',
  400,
)

export const authDetail = (error: AuthError) => ({
  detail: {
    code: error.code,
    message: error.message,
    ...(error.retryAfterSeconds == null ? {} : { retry_after_seconds: error.retryAfterSeconds }),
  },
})
