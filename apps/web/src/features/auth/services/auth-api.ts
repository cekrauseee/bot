export type AuthUser = {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  avatar_url: string | null
}

export type OtpRequest = {
  challenge_id: string
  expires_in_seconds: number
  resend_after_seconds: number
}

type ApiErrorDetail = {
  code?: string
  message?: string
  retry_after_seconds?: number
}

export class AuthApiError extends Error {
  code?: string
  status: number
  retryAfterSeconds?: number

  constructor(status: number, detail: ApiErrorDetail | string) {
    const normalized = typeof detail === 'string' ? { message: detail } : detail
    super(normalized.message || 'Something went wrong. Try again.')
    this.name = 'AuthApiError'
    this.status = status
    this.code = normalized.code
    this.retryAfterSeconds = normalized.retry_after_seconds
  }
}

const configuredApiBase = import.meta.env.VITE_API_BASE_URL?.trim()

if (import.meta.env.PROD && !configuredApiBase) {
  throw new Error(
    'VITE_API_BASE_URL must be configured for production (the API is served on a sibling origin).',
  )
}

const apiBase = (configuredApiBase || '').replace(/\/$/, '')

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const isJsonRequest = Boolean(init?.body)
  const headers = new Headers(init?.headers)

  if (isJsonRequest) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    credentials: 'include',
    headers,
  })

  if (!response.ok) {
    let detail: ApiErrorDetail | string = 'Something went wrong. Try again.'
    try {
      const body = (await response.json()) as {
        detail?: ApiErrorDetail | string
      }
      detail = body.detail || detail
    } catch {
      // Keep the generic message for non-JSON responses.
    }
    throw new AuthApiError(response.status, detail)
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export const authApi = {
  requestOtp: (email: string) =>
    request<OtpRequest>('/auth/otp/request', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  verifyOtp: (challengeId: string, code: string) =>
    request<{ user: AuthUser }>('/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ challenge_id: challengeId, code }),
    }),
  getSession: () => request<AuthUser>('/auth/session'),
  signOut: () => request<void>('/auth/sign-out', { method: 'POST' }),
  googleStartUrl: () => `${apiBase}/auth/google/start`,
}
