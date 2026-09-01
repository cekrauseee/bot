import type {
  ApiConversationMessage,
  ChatActivityItem,
  ChatMessage,
  ChatMessageBlock,
  ConversationSummary,
  ProjectSummary,
  SearchSource,
} from '../model'

const configuredApiBase = import.meta.env.VITE_API_BASE_URL?.trim()
if (import.meta.env.PROD && !configuredApiBase) {
  throw new Error('VITE_API_BASE_URL must be configured for production.')
}
const apiBase = (configuredApiBase || '').replace(/\/$/, '')

export type ModelName = 'gpt-5.6-sol' | 'gpt-5.6-luna'
export type ReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
export type Speed = 'standard' | 'fast'

export type SearchStep = {
  id: string
  kind: 'web_search'
  status: 'in_progress' | 'completed'
  label: string
  query?: string
  sources?: SearchSource[]
}

export type StreamEvent =
  | {
      version: 1
      sequence: number
      turn_id: string
      type: 'turn.started'
      data: {
        conversation: ConversationSummary
        user_message: ApiConversationMessage
        assistant_message: ApiConversationMessage
      }
    }
  | {
      version: 1
      sequence: number
      turn_id: string
      type: 'reasoning.delta' | 'text.delta'
      data: { delta: string }
    }
  | {
      version: 1
      sequence: number
      turn_id: string
      type: 'step.started' | 'step.updated' | 'step.completed'
      data: { step: SearchStep }
    }
  | {
      version: 1
      sequence: number
      turn_id: string
      type: 'turn.completed'
      data: Record<string, unknown>
    }
  | {
      version: 1
      sequence: number
      turn_id: string
      type: 'turn.failed'
      data: { error: { code: string; message: string; retryable: boolean } }
    }

export type ConversationDetail = ConversationSummary & {
  messages: ApiConversationMessage[]
}

export const hasResponseProgress = (event: StreamEvent) => event.type === 'turn.completed' ||
  ((event.type === 'text.delta' || event.type === 'reasoning.delta') && Boolean(event.data.delta.trim())) ||
  event.type === 'step.started' || event.type === 'step.updated' || event.type === 'step.completed'

export type TurnInput = {
  retry_of?: string
  message: string
  model: ModelName
  reasoning_effort: ReasoningEffort
  speed: Speed
}

export class ConversationApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ConversationApiError'
    this.status = status
  }
}

const allowedEvents = new Set<StreamEvent['type']>([
  'turn.started',
  'reasoning.delta',
  'text.delta',
  'step.started',
  'step.updated',
  'step.completed',
  'turn.completed',
  'turn.failed',
])

const isActivityItem = (value: unknown): value is ChatActivityItem => {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<ChatActivityItem>
  return typeof item.id === 'string' && typeof item.type === 'string'
}

const messageBlocks = (message: ApiConversationMessage): ChatMessageBlock[] => {
  const blocks: ChatMessageBlock[] = []
  const working = message.status === 'streaming'
  const activities = Array.isArray(message.activities)
    ? message.activities.filter(isActivityItem)
    : []
  const hasSequencedReasoning = activities.some((item) => item.type === 'text')
  if (activities.length) {
    blocks.push({
      id: `${message.id}-activity`,
      type: 'activity',
      status: working ? 'working' : 'complete',
      items: activities,
    })
  }
  if (message.reasoning && !hasSequencedReasoning) {
    blocks.push({
      id: `${message.id}-reasoning`,
      type: 'reasoning',
      status: working ? 'working' : 'complete',
      content: message.reasoning,
    })
  }
  if (message.content) {
    blocks.push({ id: `${message.id}-text`, type: 'text', content: message.content })
  }
  if (!blocks.length && message.error_message && message.status !== 'failed') {
    blocks.push({ id: `${message.id}-error`, type: 'text', content: message.error_message })
  }
  return blocks
}

const persistedProcessDuration = (message: ApiConversationMessage) => {
  const startedAt = Date.parse(message.created_at)
  const completedAt = Date.parse(message.updated_at)
  if (!Number.isFinite(startedAt) || !Number.isFinite(completedAt)) return undefined
  return Math.max(1, Math.round((completedAt - startedAt) / 1000))
}

export const mapApiMessage = (message: ApiConversationMessage): ChatMessage => {
  const blocks = messageBlocks(message)
  const processDuration = message.role === 'assistant'
    ? persistedProcessDuration(message)
    : undefined
  return {
    id: message.id,
    role: message.role,
    createdAt: message.created_at,
    blocks,
    ...(message.status === 'failed' ? { errorMessage: message.error_message || 'The response could not be completed.' } : {}),
    status: message.status === 'streaming'
      ? 'streaming'
      : message.status === 'failed'
        ? 'error'
        : 'complete',
    ...(processDuration !== undefined ? { processDuration } : {}),
  }
}

const parseError = async (response: Response, fallback: string) => {
  try {
    const body = await response.json() as { detail?: { message?: unknown } | string }
    if (typeof body.detail === 'string' && body.detail.trim()) return body.detail
    if (body.detail && typeof body.detail === 'object' && typeof body.detail.message === 'string') {
      return body.detail.message
    }
  } catch {
    // Use the stable fallback for non-JSON error responses.
  }
  return fallback
}

async function request<T>(
  path: string,
  init?: RequestInit,
  fallback = 'Unable to load conversations.',
): Promise<T> {
  const headers = new Headers(init?.headers)
  if (init?.body) headers.set('content-type', 'application/json')
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    credentials: 'include',
    headers,
  })
  if (!response.ok) {
    throw new ConversationApiError(await parseError(response, fallback), response.status)
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>
}

export function loadConversationCatalog(signal?: AbortSignal) {
  return Promise.all([
    request<{ conversations: ConversationSummary[] }>('/conversations', { signal }),
    request<{ projects: ProjectSummary[] }>('/projects', { signal }),
  ]).then(([conversationResult, projectResult]) => ({
    conversations: conversationResult.conversations,
    projects: projectResult.projects,
  }))
}

export function loadConversationDetail(id: string, signal?: AbortSignal) {
  return request<ConversationDetail>(`/conversations/${id}`, { signal })
}

export async function startConversationTurn(
  conversationId: string | undefined,
  input: TurnInput,
  signal: AbortSignal,
) {
  const path = conversationId
    ? `/conversations/${conversationId}/turns`
    : '/conversations/turns'
  const response = await fetch(`${apiBase}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  })
  if (!response.ok) {
    throw new ConversationApiError(
      await parseError(response, 'Unable to send the message. Try again.'),
      response.status,
    )
  }
  return response
}

export function deleteConversation(id: string) {
  return request<void>(`/conversations/${id}`, { method: 'DELETE' })
}

export function renameConversation(id: string, title: string) {
  return request<ConversationSummary>(`/conversations/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ title }),
  }, 'Unable to rename the conversation. Try again.')
}

export function reorderConversationProjects(projectIds: string[]) {
  return request<{ projects: ProjectSummary[] }>('/projects/order', {
    method: 'PATCH',
    body: JSON.stringify({ project_ids: projectIds }),
  }, 'Unable to reorder projects. Try again.')
}

export function createConversationProject(name: string) {
  return request<ProjectSummary>('/projects', {
    method: 'POST',
    body: JSON.stringify({ name }),
  }, 'Unable to create the project. Try again.')
}

export function renameConversationProject(id: string, name: string) {
  return request<ProjectSummary>(`/projects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  }, 'Unable to rename the project. Try again.')
}

export function deleteConversationProject(id: string) {
  return request<void>(`/projects/${id}`, {
    method: 'DELETE',
  }, 'Unable to delete the project. Try again.')
}

export function moveConversationToProject(conversationId: string, projectId: string | null) {
  return request<ConversationSummary>(
    `/conversations/${conversationId}/project`,
    {
      method: 'PATCH',
      body: JSON.stringify({ project_id: projectId }),
    },
    'Unable to move the conversation. Try again.',
  )
}

export function setConversationPinned(id: string, pinned: boolean) {
  return request<ConversationSummary>(`/conversations/${id}/pin`, {
    method: 'PATCH',
    body: JSON.stringify({ pinned }),
  }, 'Unable to update the pinned conversation. Try again.')
}

export function reorderPinnedConversations(conversationIds: string[]) {
  return request<{ conversations: ConversationSummary[] }>('/conversations/pinned-order', {
    method: 'PATCH',
    body: JSON.stringify({ conversation_ids: conversationIds }),
  }, 'Unable to reorder pinned conversations. Try again.')
}

const parseEventBlock = (block: string): StreamEvent | undefined => {
  let eventName: string | undefined
  const dataLines: string[] = []
  for (const line of block.split(/\r?\n/)) {
    if (!line || line.startsWith(':')) continue
    if (line.startsWith('event:')) eventName = line.slice(6).trim()
    if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart())
  }
  if (!dataLines.length) return undefined

  let value: unknown
  try {
    value = JSON.parse(dataLines.join('\n'))
  } catch {
    throw new Error('The response stream was invalid. Try again.')
  }
  if (!value || typeof value !== 'object') {
    throw new Error('The response stream was invalid. Try again.')
  }
  const event = value as Partial<StreamEvent>
  if (
    event.version !== 1 ||
    !Number.isInteger(event.sequence) ||
    typeof event.turn_id !== 'string' ||
    typeof event.type !== 'string' ||
    !allowedEvents.has(event.type as StreamEvent['type']) ||
    !event.data ||
    typeof event.data !== 'object' ||
    (eventName !== undefined && eventName !== event.type)
  ) {
    throw new Error('The response stream was invalid. Try again.')
  }
  return event as StreamEvent
}

export const parseSseBuffer = (input: string) => {
  const events: StreamEvent[] = []
  let remainder = input
  while (true) {
    const separator = /\r?\n\r?\n/.exec(remainder)
    if (!separator || separator.index === undefined) break
    const block = remainder.slice(0, separator.index)
    remainder = remainder.slice(separator.index + separator[0].length)
    const event = parseEventBlock(block)
    if (event) events.push(event)
  }
  return { events, remainder }
}

export async function readEventStream(
  response: Response,
  onEvent: (event: StreamEvent) => void,
) {
  if (!response.body) throw new Error('The response did not include a stream.')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let turnId: string | undefined
  let lastSequence = -1
  let terminal = false

  while (true) {
    const part = await reader.read()
    if (part.done) break
    buffer += decoder.decode(part.value, { stream: true })
    const parsed = parseSseBuffer(buffer)
    buffer = parsed.remainder
    for (const event of parsed.events) {
      if (
        terminal ||
        event.sequence <= lastSequence ||
        (turnId !== undefined && event.turn_id !== turnId) ||
        (turnId === undefined && event.type !== 'turn.started')
      ) {
        throw new Error('The response stream was invalid. Try again.')
      }
      turnId ??= event.turn_id
      lastSequence = event.sequence
      terminal = event.type === 'turn.completed' || event.type === 'turn.failed'
      onEvent(event)
    }
  }
  buffer += decoder.decode()
  if (buffer.trim() || !terminal) {
    throw new Error('The response stream ended before completion. Try again.')
  }
}
