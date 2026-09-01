import { ApiError, apiBaseUrl, apiRequest } from "@/lib/api"

export type User = {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  avatar_url: string | null
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
}
