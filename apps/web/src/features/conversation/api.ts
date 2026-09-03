import type { ConversationSummary } from "@/features/app-shell/api"
import { apiRequest } from "@/lib/api"

export type ApiConversationMessage = {
  activities?: unknown
  content: string
  created_at: string
  error_message?: string | null
  id: string
  reasoning?: string | null
  role: "assistant" | "user"
  status?: string | null
  updated_at: string
}

export type ConversationDetail = ConversationSummary & {
  active_run?: unknown
  messages: unknown[]
  plan?: unknown[]
}

export const conversationApi = {
  detail: (conversationId: string, signal?: AbortSignal) =>
    apiRequest<ConversationDetail>(
      `/conversations/${encodeURIComponent(conversationId)}`,
      { signal }
    ),
  cancelRun: (runId: string) =>
    apiRequest<void>(`/agent-runs/${encodeURIComponent(runId)}/cancel`, {
      method: "POST",
    }),
}
