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
  active: boolean
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

export type ProviderConnectionApi = {
  get: () => Promise<ProviderConnection>
  startLogin: () => Promise<LoginStart>
  getLoginStatus: (loginId: string) => Promise<LoginStatus>
  cancelLogin: (loginId: string) => Promise<void>
  disconnect: () => Promise<void>
  setActive: (active: boolean) => Promise<ProviderConnection>
}

export function createProviderConnectionApi(
  connectionId: string
): ProviderConnectionApi {
  const connectionPath = `/provider-connections/${encodeURIComponent(connectionId)}`

  return {
    get: () =>
      apiRequest<ProviderConnection>(connectionPath, {
        cache: "no-store",
      }),
    startLogin: () =>
      apiRequest<LoginStart>(`${connectionPath}/logins`, {
        method: "POST",
      }),
    getLoginStatus: (loginId: string) =>
      apiRequest<LoginStatus>(
        `${connectionPath}/logins/${encodeURIComponent(loginId)}`,
        { cache: "no-store" }
      ),
    cancelLogin: (loginId: string) =>
      apiRequest<void>(
        `${connectionPath}/logins/${encodeURIComponent(loginId)}`,
        { method: "DELETE" }
      ),
    disconnect: () =>
      apiRequest<void>(connectionPath, {
        method: "DELETE",
      }),
    setActive: (active: boolean) =>
      apiRequest<ProviderConnection>(connectionPath, {
        method: "PATCH",
        body: JSON.stringify({ active }),
      }),
  }
}

export const openAiCodexConnectionApi =
  createProviderConnectionApi("openai-codex")
