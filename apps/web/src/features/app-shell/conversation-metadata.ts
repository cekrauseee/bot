import type { ConversationSummary } from "@/features/app-shell/api"

function timestamp(value: string | null) {
  if (!value) return Number.NEGATIVE_INFINITY
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY
}

export function mergeConversationTitle(
  current: ConversationSummary | undefined,
  incoming: ConversationSummary
) {
  if (!current) return incoming

  const merged =
    timestamp(incoming.title_updated_at) >= timestamp(current.title_updated_at)
      ? incoming
      : {
          ...incoming,
          title: current.title,
          title_updated_at: current.title_updated_at,
        }

  return timestamp(incoming.model_updated_at) >=
    timestamp(current.model_updated_at)
    ? merged
    : {
        ...merged,
        model: current.model,
        model_updated_at: current.model_updated_at,
      }
}

export function mergeConversationCatalog(
  current: ConversationSummary[],
  incoming: ConversationSummary[]
) {
  const currentById = new Map(
    current.map((conversation) => [conversation.id, conversation])
  )

  return incoming.map((conversation) =>
    mergeConversationTitle(currentById.get(conversation.id), conversation)
  )
}

export function parseConversationSummary(
  value: unknown
): ConversationSummary | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null
  }

  const conversation = value as Record<string, unknown>
  if (
    typeof conversation.id !== "string" ||
    typeof conversation.title !== "string" ||
    typeof conversation.model !== "string" ||
    typeof conversation.model_updated_at !== "string" ||
    (conversation.project_id !== null &&
      typeof conversation.project_id !== "string") ||
    (conversation.pinned_order !== null &&
      typeof conversation.pinned_order !== "number") ||
    (conversation.pin_updated_at !== null &&
      typeof conversation.pin_updated_at !== "string") ||
    (conversation.title_updated_at !== null &&
      typeof conversation.title_updated_at !== "string") ||
    typeof conversation.created_at !== "string" ||
    typeof conversation.updated_at !== "string"
  ) {
    return null
  }

  return {
    id: conversation.id,
    title: conversation.title,
    model: conversation.model,
    model_updated_at: conversation.model_updated_at,
    project_id: conversation.project_id,
    pinned_order: conversation.pinned_order,
    pin_updated_at: conversation.pin_updated_at,
    title_updated_at: conversation.title_updated_at,
    created_at: conversation.created_at,
    updated_at: conversation.updated_at,
  }
}
