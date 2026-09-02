type ApiErrorDetail = {
  code?: string
  message?: string
  retry_after_seconds?: number
}

type ApiErrorBody = {
  detail?: ApiErrorDetail | Array<{ msg?: string }>
}

export class ApiError extends Error {
  readonly status: number
  readonly code?: string
  readonly retryAfterSeconds?: number

  constructor(message: string, status: number, detail?: ApiErrorDetail) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.code = detail?.code
    this.retryAfterSeconds = detail?.retry_after_seconds
  }
}

export const apiBaseUrl = (
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000"
).replace(/\/$/, "")

export async function apiErrorFromResponse(
  response: Response,
  fallback: string
) {
  let body: ApiErrorBody | undefined
  try {
    body = (await response.json()) as ApiErrorBody
  } catch {
    body = undefined
  }

  const detail = Array.isArray(body?.detail) ? undefined : body?.detail
  const validationMessage = Array.isArray(body?.detail)
    ? body.detail[0]?.msg
    : undefined

  return new ApiError(
    detail?.message ?? validationMessage ?? fallback,
    response.status,
    detail
  )
}

export async function apiRequest<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: "include",
    headers: init?.body
      ? { "Content-Type": "application/json", ...init.headers }
      : init?.headers,
  })

  if (response.ok) {
    if (response.status === 204) return undefined as T
    return (await response.json()) as T
  }

  throw await apiErrorFromResponse(
    response,
    "The request could not be completed."
  )
}

export function apiErrorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback
}
