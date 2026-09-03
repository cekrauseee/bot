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
  if (
    normalized === "pro_lite" ||
    normalized === "pro-lite" ||
    normalized === "prolite"
  ) {
    return "Pro 5x Subscription"
  }
  if (normalized === "plus") return "Plus Subscription"
  if (normalized === "pro") return "Pro 20x Subscription"
  if (normalized === "team") return "Team Subscription"
  if (normalized === "enterprise") return "Enterprise Subscription"
  if (!normalized) return "Subscription unavailable"
  return "Other Subscription"
}
