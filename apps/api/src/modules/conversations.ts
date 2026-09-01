import type { Settings } from '../config.js'
import type { Conversation, Message } from '../db/repository.js'
import type { ModelName, ProcessingMode, ReasoningEffort } from './models.js'

export type { ModelName, ReasoningEffort }
export type Speed = ProcessingMode

export type TurnOptions = {
  retry_of?: string
  message: string
  model: ModelName
  reasoning_effort: ReasoningEffort
  speed: Speed
}

export type AiClient = (
  input: Record<string, unknown>,
  signal: AbortSignal,
  headers?: Record<string, string>,
) => Promise<Response>

export type TitleClient = AiClient

const iso = (value: Date | string) =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString()

export const publicConversation = (conversation: Conversation) => ({
  id: conversation.id,
  title: conversation.title,
  project_id: conversation.projectId,
  pinned_order: conversation.pinnedOrder,
  pin_updated_at: conversation.pinUpdatedAt ? iso(conversation.pinUpdatedAt) : null,
  title_updated_at: conversation.titleUpdatedAt ? iso(conversation.titleUpdatedAt) : null,
  created_at: iso(conversation.createdAt),
  updated_at: iso(conversation.updatedAt),
})

export const publicMessage = (message: Message) => ({
  id: message.id,
  role: message.role,
  content: message.content,
  reasoning: message.reasoning,
  status: message.status,
  error_message: message.errorMessage,
  model: message.model,
  reasoning_effort: message.reasoningEffort,
  speed: message.speed,
  activities: message.activities,
  created_at: iso(message.createdAt),
  updated_at: iso(message.updatedAt),
})

export const conversationTitle = (message: string) =>
  message.trim().replace(/\s+/g, ' ').slice(0, 120) || 'New conversation'

export const createAiClient = (settings: Settings): AiClient => async (input, signal, headers) => {
  const connectionController = new AbortController()
  const timeout = setTimeout(() => connectionController.abort(), 30_000)
  try {
    return await fetch(`${settings.aiBaseUrl}/agent/stream`, {
      method: 'POST',
      signal: AbortSignal.any([signal, connectionController.signal]),
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${settings.aiServiceToken}`,
        ...headers,
      },
      body: JSON.stringify(input),
    })
  } finally {
    clearTimeout(timeout)
  }
}

export const createTitleClient = (settings: Settings): TitleClient => async (input, signal, headers) => {
  const connectionController = new AbortController()
  const timeout = setTimeout(() => connectionController.abort(), 15_000)
  try {
    return await fetch(`${settings.aiBaseUrl}/agent/title`, {
      method: 'POST',
      signal: AbortSignal.any([signal, connectionController.signal]),
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${settings.aiServiceToken}`,
        ...headers,
      },
      body: JSON.stringify(input),
    })
  } finally {
    clearTimeout(timeout)
  }
}
