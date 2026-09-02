import type { ProviderConnection } from "@/features/provider-connections/api"

export const codexProvider = {
  id: "openai",
  displayName: "ChatGPT",
  productName: "Codex",
} as const

export function usageWindow(connection: ProviderConnection) {
  return connection.limits?.primary ?? connection.limits?.secondary ?? null
}

export function formatResetDate(value: string | null) {
  if (!value) return "Unavailable"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Unavailable"
  return date.toLocaleDateString(undefined, { dateStyle: "medium" })
}

export function planLabel(planType: string | null | undefined) {
  const normalized = planType?.trim().toLowerCase().replace(/\s+/g, "_")
  if (normalized === "pro_lite" || normalized === "pro-lite") {
    return "ChatGPT Pro 5x Subscription"
  }
  if (normalized === "plus") return "ChatGPT Plus Subscription"
  if (normalized === "pro") return "ChatGPT Pro Subscription"
  if (normalized === "team") return "ChatGPT Team Subscription"
  if (normalized === "enterprise") return "ChatGPT Enterprise Subscription"
  if (!planType) return "Unavailable"
  return `ChatGPT ${planType} Subscription`
}
