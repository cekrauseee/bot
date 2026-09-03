import { ApiError, apiBaseUrl, apiRequest } from "@/lib/api"

export type User = {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  avatar_url: string | null
  default_model: string
}

export type OtpChallenge = {
  challenge_id: string
  expires_in_seconds: number
  resend_after_seconds: number
  development_code?: string
}

export { ApiError as AuthApiError }

export const authApi = {
  googleStartUrl: `${apiBaseUrl}/auth/google/start`,
  session: () => apiRequest<User>("/auth/session"),
  setDefaultModel: (model: string) =>
    apiRequest<User>("/preferences/model", {
      method: "PATCH",
      body: JSON.stringify({ model }),
    }),
  requestOtp: (email: string) =>
    apiRequest<OtpChallenge>("/auth/otp/request", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  verifyOtp: (challengeId: string, code: string) =>
    apiRequest<{ user: User }>("/auth/otp/verify", {
      method: "POST",
      body: JSON.stringify({ challenge_id: challengeId, code }),
    }),
  signOut: () => apiRequest<void>("/auth/sign-out", { method: "POST" }),
  completeDesktop: (transactionId: string) =>
    apiRequest<{ callback_url: string }>("/auth/desktop/complete", {
      method: "POST",
      body: JSON.stringify({ transaction_id: transactionId }),
    }),
}
