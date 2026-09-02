import { apiRequest } from "@/lib/api"

export type ConnectionWindow = {
  used_percent: number
  window_duration_minutes: number | null
  resets_at: string | null
}

export type ProviderConnection = {
  status: "unavailable" | "disconnected" | "connecting" | "connected"
  account: { email: string | null; plan_type: string } | null
  limits: {
    primary: ConnectionWindow | null
    secondary: ConnectionWindow | null
    reached: boolean
  } | null
  login_mode: "browser" | "device"
}

export type LoginStart =
  | {
      type: "browser"
      login_id: string
      auth_url: string
    }
  | {
      type: "device_code"
      login_id: string
      verification_url: string
      user_code: string
    }

export type LoginStatus =
  | { status: "pending" }
  | { status: "connected"; connection?: ProviderConnection }
  | { status: "failed"; message?: string }

export const providerConnectionsApi = {
  get: () =>
    apiRequest<ProviderConnection>("/provider-connections/openai-codex", {
      cache: "no-store",
    }),
  startLogin: () =>
    apiRequest<LoginStart>("/provider-connections/openai-codex/logins", {
      method: "POST",
    }),
  getLoginStatus: (loginId: string) =>
    apiRequest<LoginStatus>(
      `/provider-connections/openai-codex/logins/${encodeURIComponent(loginId)}`,
      { cache: "no-store" }
    ),
  cancelLogin: (loginId: string) =>
    apiRequest<void>(
      `/provider-connections/openai-codex/logins/${encodeURIComponent(loginId)}`,
      { method: "DELETE" }
    ),
  disconnect: () =>
    apiRequest<void>("/provider-connections/openai-codex", {
      method: "DELETE",
    }),
}
