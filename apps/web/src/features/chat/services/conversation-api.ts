import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  ApiConversationMessage,
  ChatActivityItem,
  ChatMessage,
  ChatMessageBlock,
  ConversationSummary,
  SearchSource,
} from '../model'

const configuredApiBase = import.meta.env.VITE_API_BASE_URL?.trim()
if (import.meta.env.PROD && !configuredApiBase) {
  throw new Error('VITE_API_BASE_URL must be configured for production.')
}
const apiBase = (configuredApiBase || '').replace(/\/$/, '')

type ModelName = 'gpt-5.6-sol' | 'gpt-5.6-luna'
type ReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
type Speed = 'standard' | 'fast'

type SearchStep = {
  id: string
  kind: 'web_search'
  status: 'in_progress' | 'completed'
  label: string
  query?: string
  sources?: SearchSource[]
}

type StreamEvent =
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

export type ConversationState = {
  conversations: ConversationSummary[]
  messages: ChatMessage[]
  title: string
  loading: boolean
  streaming: boolean
  loadError: string
  turnError: string
  status: string
  activeAssistantId?: string
  activeConversationId?: string
}

export const initialConversationState: ConversationState = {
  conversations: [],
  messages: [],
  title: 'New conversation',
  loading: true,
  streaming: false,
  loadError: '',
  turnError: '',
  status: '',
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

const safeSource = (value: unknown): SearchSource | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const source = value as Record<string, unknown>
  const title = typeof source.title === 'string' ? source.title : ''
  const rawUrl = typeof source.url === 'string' ? source.url : undefined
  let url: string | undefined
  let domain = typeof source.domain === 'string' ? source.domain : undefined
  if (rawUrl) {
    try {
      const parsed = new URL(rawUrl)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined
      url = parsed.toString()
      domain ??= parsed.hostname
    } catch {
      return undefined
    }
  }
  if (!title && !url) return undefined
  return {
    id: typeof source.id === 'string' ? source.id : url ?? title,
    title: title || url!,
    ...(domain ? { domain } : {}),
    ...(url ? { url } : {}),
  }
}

const isActivityItem = (value: unknown): value is ChatActivityItem => {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<ChatActivityItem>
  return typeof item.id === 'string' && typeof item.type === 'string'
}

const defaultProcessBlock = (messageId: string): ChatMessageBlock => ({
  id: `${messageId}-activity`,
  type: 'activity',
  status: 'complete',
  items: [{
    id: `${messageId}-generated-response`,
    type: 'step',
    label: 'Generated the response',
    status: 'complete',
  }],
})

const messageBlocks = (message: ApiConversationMessage): ChatMessageBlock[] => {
  const blocks: ChatMessageBlock[] = []
  const working = message.status === 'streaming'
  const activities = Array.isArray(message.activities)
    ? message.activities.filter(isActivityItem)
    : []
  if (activities.length) {
    blocks.push({
      id: `${message.id}-activity`,
      type: 'activity',
      status: working ? 'working' : 'complete',
      items: activities,
    })
  }
  if (message.reasoning) {
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
  if (
    message.role === 'assistant' &&
    message.content &&
    !blocks.some((block) => block.type === 'activity' || block.type === 'reasoning')
  ) {
    blocks.unshift(defaultProcessBlock(message.id))
  }
  if (!blocks.length && message.error_message) {
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
  const hasProcess = blocks.some(
    (block) => block.type === 'activity' || block.type === 'reasoning',
  )
  return {
    id: message.id,
    role: message.role,
    blocks,
    status: message.status === 'streaming'
      ? 'streaming'
      : message.status === 'failed'
        ? 'error'
        : 'complete',
    ...(hasProcess ? { processDuration: persistedProcessDuration(message) } : {}),
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  if (init?.body) headers.set('content-type', 'application/json')
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    credentials: 'include',
    headers,
  })
  if (!response.ok) throw new Error(await parseError(response, 'Unable to load conversations.'))
  return response.status === 204 ? undefined as T : response.json() as Promise<T>
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

const upsertConversation = (
  conversations: ConversationSummary[],
  conversation: ConversationSummary,
) => [conversation, ...conversations.filter((item) => item.id !== conversation.id)]

const terminalBlocks = (blocks: ChatMessageBlock[]) => blocks.map((block) =>
  block.type === 'activity' || block.type === 'reasoning'
    ? { ...block, status: 'complete' as const }
    : block)

const elapsedProcessDuration = (message: ChatMessage) =>
  message.processStartedAt
    ? Math.max(1, Math.round((Date.now() - message.processStartedAt) / 1000))
    : message.processDuration

const updateAssistant = (
  messages: ChatMessage[],
  assistantId: string | undefined,
  update: (message: ChatMessage) => ChatMessage,
) => messages.map((message) =>
  message.role === 'assistant' && message.id === assistantId ? update(message) : message)

const searchItem = (step: SearchStep): ChatActivityItem => ({
  id: step.id,
  type: 'search',
  query: step.query || step.label,
  results: (step.sources ?? []).map(safeSource).filter(
    (source): source is SearchSource => source !== undefined,
  ),
})

export const applyStreamEvent = (
  state: ConversationState,
  event: StreamEvent,
): ConversationState => {
  if (event.type === 'turn.started') {
    const messages = [...state.messages]
    const userIndex = messages.length - 2
    const assistantIndex = messages.length - 1
    if (userIndex >= 0) messages[userIndex] = mapApiMessage(event.data.user_message)
    if (assistantIndex >= 0) {
      const optimisticAssistant = messages[assistantIndex]
      messages[assistantIndex] = {
        ...mapApiMessage(event.data.assistant_message),
        processLabel: 'Thinking…',
        processStartedAt: optimisticAssistant.processStartedAt ?? Date.now(),
        processDuration: undefined,
      }
    }
    return {
      ...state,
      conversations: upsertConversation(state.conversations, event.data.conversation),
      messages,
      title: event.data.conversation.title,
      loading: false,
      streaming: true,
      status: 'Responding…',
      activeAssistantId: event.data.assistant_message.id,
      activeConversationId: event.data.conversation.id,
    }
  }

  if (event.type === 'reasoning.delta') {
    return {
      ...state,
      messages: updateAssistant(state.messages, state.activeAssistantId, (assistant) => {
        const existing = assistant.blocks.find((block) => block.type === 'reasoning')
        return {
          ...assistant,
          processLabel: 'Thinking…',
          blocks: existing
            ? assistant.blocks.map((block) => block.type === 'reasoning'
              ? { ...block, content: block.content + event.data.delta }
              : block)
            : [
                ...assistant.blocks.filter((block) => block.type === 'activity'),
                {
                  id: `${assistant.id}-reasoning`,
                  type: 'reasoning',
                  content: event.data.delta,
                  status: 'working',
                },
                ...assistant.blocks.filter((block) => block.type !== 'activity'),
              ],
        }
      }),
    }
  }

  if (event.type === 'text.delta') {
    return {
      ...state,
      messages: updateAssistant(state.messages, state.activeAssistantId, (assistant) => {
        const existing = assistant.blocks.find((block) => block.type === 'text')
        const completedProcess = terminalBlocks(assistant.blocks)
        const hasProcess = completedProcess.some(
          (block) => block.type === 'activity' || block.type === 'reasoning',
        )
        return {
          ...assistant,
          processLabel: undefined,
          processDuration: elapsedProcessDuration(assistant),
          blocks: existing
            ? assistant.blocks.map((block) => block.type === 'text'
              ? { ...block, content: block.content + event.data.delta }
              : block)
            : [
                ...(hasProcess
                  ? completedProcess
                  : [defaultProcessBlock(assistant.id)]),
                {
                  id: `${assistant.id}-text`,
                  type: 'text',
                  content: event.data.delta,
                },
              ],
        }
      }),
    }
  }

  if (
    event.type === 'step.started' ||
    event.type === 'step.updated' ||
    event.type === 'step.completed'
  ) {
    return {
      ...state,
      messages: updateAssistant(state.messages, state.activeAssistantId, (assistant) => {
        const item = searchItem(event.data.step)
        const existing = assistant.blocks.find((block) => block.type === 'activity')
        return {
          ...assistant,
          processLabel: event.type === 'step.completed'
            ? 'Thinking…'
            : 'Searching the web…',
          blocks: existing && existing.type === 'activity'
            ? assistant.blocks.map((block) => block.type === 'activity'
              ? {
                  ...block,
                  items: [...block.items.filter((entry) => entry.id !== item.id), item],
                }
              : block)
            : [{
                id: `${assistant.id}-activity`,
                type: 'activity',
                status: 'working',
                items: [item],
              }, ...assistant.blocks],
        }
      }),
    }
  }

  const completedAt = new Date().toISOString()
  const current = state.conversations.find(
    (item) => item.id === state.activeConversationId,
  )
  const conversations = current
    ? upsertConversation(state.conversations, { ...current, updated_at: completedAt })
    : state.conversations
  const failed = event.type === 'turn.failed'
  const cancelled = failed && event.data.error.code === 'cancelled'
  return {
    ...state,
    conversations,
    messages: updateAssistant(state.messages, state.activeAssistantId, (assistant) => ({
      ...assistant,
      blocks: terminalBlocks(assistant.blocks),
      status: failed ? 'error' : 'complete',
      processLabel: undefined,
      processStartedAt: undefined,
      processDuration: elapsedProcessDuration(assistant),
    })),
    streaming: false,
    status: '',
    turnError: failed && !cancelled
      ? event.data.error.message || 'Unable to complete the response. Try again.'
      : '',
    activeAssistantId: undefined,
  }
}

type ConversationDetail = ConversationSummary & { messages: ApiConversationMessage[] }

export function useConversation(
  conversationId: string | undefined,
  onStarted?: (id: string) => void,
) {
  const [state, setState] = useState<ConversationState>(initialConversationState)
  const stateRef = useRef(state)
  const routeConversationRef = useRef(conversationId)
  const streamConversationRef = useRef<string | undefined>(undefined)
  const streamAbortRef = useRef<AbortController | null>(null)
  const loadAbortRef = useRef<AbortController | null>(null)
  const onStartedRef = useRef(onStarted)

  useEffect(() => {
    stateRef.current = state
  }, [state])
  useEffect(() => {
    routeConversationRef.current = conversationId
  }, [conversationId])
  useEffect(() => {
    onStartedRef.current = onStarted
  }, [onStarted])

  const load = useCallback(async (id = routeConversationRef.current) => {
    loadAbortRef.current?.abort()
    const controller = new AbortController()
    loadAbortRef.current = controller
    setState((current) => ({ ...current, loading: true, loadError: '', turnError: '' }))
    try {
      const [list, detail] = await Promise.all([
        request<{ conversations: ConversationSummary[] }>('/conversations', {
          signal: controller.signal,
        }),
        id
          ? request<ConversationDetail>(`/conversations/${id}`, { signal: controller.signal })
          : Promise.resolve(undefined),
      ])
      if (controller.signal.aborted) return
      setState((current) => ({
        ...current,
        conversations: list.conversations,
        messages: detail?.messages.map(mapApiMessage) ?? [],
        title: detail?.title ?? 'New conversation',
        loading: false,
        streaming: false,
        loadError: '',
        activeAssistantId: undefined,
        activeConversationId: id,
      }))
    } catch (error) {
      if (controller.signal.aborted) return
      setState((current) => ({
        ...current,
        loading: false,
        loadError: error instanceof Error ? error.message : 'Unable to load conversations.',
      }))
    }
  }, [])

  useEffect(() => {
    if (
      stateRef.current.streaming &&
      conversationId === streamConversationRef.current
    ) return
    if (stateRef.current.streaming) streamAbortRef.current?.abort()
    void load(conversationId)
  }, [conversationId, load])

  useEffect(() => () => {
    streamAbortRef.current?.abort()
    loadAbortRef.current?.abort()
  }, [])

  const send = useCallback(async (
    message: string,
    model: ModelName,
    reasoningEffort: ReasoningEffort,
    speed: Speed,
  ) => {
    if (stateRef.current.streaming) return
    const controller = new AbortController()
    streamAbortRef.current = controller
    streamConversationRef.current = routeConversationRef.current
    const optimisticId = crypto.randomUUID()
    const optimisticUser: ChatMessage = {
      id: `pending-user-${optimisticId}`,
      role: 'user',
      blocks: [{ id: `pending-user-${optimisticId}-text`, type: 'text', content: message }],
      status: 'complete',
    }
    const optimisticAssistant: ChatMessage = {
      id: `pending-assistant-${optimisticId}`,
      role: 'assistant',
      blocks: [],
      status: 'streaming',
      processLabel: 'Thinking…',
      processStartedAt: Date.now(),
    }
    setState((current) => ({
      ...current,
      messages: [...current.messages, optimisticUser, optimisticAssistant],
      loading: false,
      streaming: true,
      turnError: '',
      status: 'Responding…',
      activeAssistantId: optimisticAssistant.id,
    }))
    try {
      const id = routeConversationRef.current
      const path = id ? `/conversations/${id}/turns` : '/conversations/turns'
      const response = await fetch(`${apiBase}${path}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message,
          model,
          reasoning_effort: reasoningEffort,
          speed,
        }),
        signal: controller.signal,
      })
      if (!response.ok) {
        throw new Error(await parseError(response, 'Unable to send the message. Try again.'))
      }
      await readEventStream(response, (event) => {
        if (event.type === 'turn.started') {
          streamConversationRef.current = event.data.conversation.id
          onStartedRef.current?.(event.data.conversation.id)
        }
        setState((current) => applyStreamEvent(current, event))
      })
    } catch (error) {
      const cancelled = controller.signal.aborted
      setState((current) => ({
        ...current,
        messages: updateAssistant(current.messages, current.activeAssistantId, (assistant) => ({
          ...assistant,
          blocks: terminalBlocks(assistant.blocks),
          status: cancelled ? 'complete' : 'error',
          processLabel: undefined,
          processStartedAt: undefined,
          processDuration: elapsedProcessDuration(assistant),
        })),
        streaming: false,
        status: '',
        turnError: cancelled
          ? ''
          : error instanceof Error
            ? error.message
            : 'Unable to complete the response. Try again.',
        activeAssistantId: undefined,
      }))
    } finally {
      if (streamAbortRef.current === controller) streamAbortRef.current = null
    }
  }, [])

  const stop = useCallback(() => {
    streamAbortRef.current?.abort()
    setState((current) => ({
      ...current,
      messages: updateAssistant(current.messages, current.activeAssistantId, (assistant) => ({
        ...assistant,
        blocks: terminalBlocks(assistant.blocks),
        status: 'complete',
        processLabel: undefined,
        processStartedAt: undefined,
        processDuration: elapsedProcessDuration(assistant),
      })),
      streaming: false,
      status: '',
      turnError: '',
      activeAssistantId: undefined,
    }))
  }, [])

  const remove = useCallback(async (id: string) => {
    await request<void>(`/conversations/${id}`, { method: 'DELETE' })
    setState((current) => ({
      ...current,
      conversations: current.conversations.filter((conversation) => conversation.id !== id),
    }))
  }, [])

  return { ...state, send, stop, remove, reload: () => load() }
}
