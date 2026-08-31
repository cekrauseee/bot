import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  ApiConversationMessage,
  ChatActivityItem,
  ChatApprovalDecision,
  ChatBrowserFrame,
  ChatBrowserSession,
  ChatBrowserStatus,
  ChatMessage,
  ChatMessageBlock,
  ChatModelOption,
  ChatModelProvider,
  ChatProcessingMode,
  ChatReasoningEffort,
  ChatQuestionAnswers,
  ChatQuestionRequest,
  ChatTodo,
  ConversationSummary,
  ProjectSummary,
  SearchSource,
} from '../model'
import { FALLBACK_MODEL_CATALOG, reasoningEffortLabel } from '../model-catalog'

const configuredApiBase = import.meta.env.VITE_API_BASE_URL?.trim()
if (import.meta.env.PROD && !configuredApiBase) {
  throw new Error('VITE_API_BASE_URL must be configured for production.')
}
const apiBase = (configuredApiBase || '').replace(/\/$/, '')

type ModelName = string
type ReasoningEffort = ChatReasoningEffort
type Speed = ChatProcessingMode

type SearchStep = {
  id: string
  kind: 'web_search'
  status: 'in_progress' | 'completed'
  label: string
  query?: string
  sources?: unknown[]
}

const agentEventTypes = [
  'turn.started',
  'reasoning.delta',
  'text.delta',
  'step.started',
  'step.updated',
  'step.completed',
  'plan.updated',
  'user.input_required',
  'tool.started',
  'tool.updated',
  'tool.completed',
  'child.started',
  'child.completed',
  'turn.completed',
  'turn.failed',
] as const

type AgentEventType = (typeof agentEventTypes)[number]

const terminalEventTypes = new Set<AgentEventType>(['turn.completed', 'turn.failed'])

const canonicalSequence = /^(0|[1-9]\d*)$/

export const parseEventSequence = (value: unknown): bigint => {
  if (typeof value !== 'string' || !canonicalSequence.test(value)) {
    throw new Error('The response stream was invalid. Try again.')
  }
  return BigInt(value)
}

type EventEnvelope = {
  version: 2
  sequence: string
  run_id: string
  turn_id: string
}

type UserInputRequiredData = {
  question_id?: string
  id?: string
  prompt?: string
  title?: string
  description?: string
  options?: Array<{
    id?: string
    label?: string
    description?: string | null
  }>
  multiple?: boolean
  allow_custom?: boolean
  question?: unknown
}

type ToolStep = {
  id: string
  name?: string
  label?: string
  status?: string
}

type InitialTurnStartedData = {
  conversation: ConversationSummary
  user_message: ApiConversationMessage
  assistant_message: ApiConversationMessage
  plan?: unknown[]
}

type ReconciledTurnStartedData = {
  checkpoint: {
    id: string
    phase: 'runnable' | 'interrupted' | 'completed'
    content: string
    pending_question?: unknown
    resume_consumed: boolean
  }
}

export type StreamEvent = EventEnvelope & (
  | {
      type: 'turn.started'
      data: InitialTurnStartedData | ReconciledTurnStartedData
    }
  | { type: 'reasoning.delta' | 'text.delta'; data: { delta: string } }
  | { type: 'step.started' | 'step.updated' | 'step.completed'; data: { step: SearchStep } }
  | { type: 'plan.updated'; data: { plan: unknown[] } }
  | { type: 'user.input_required'; data: UserInputRequiredData }
  | { type: 'tool.started' | 'tool.updated' | 'tool.completed'; data: { tool: ToolStep } }
  | { type: 'child.started' | 'child.completed'; data: { child: ToolStep } }
  | { type: 'turn.completed'; data: Record<string, unknown> }
  | {
      type: 'turn.failed'
      data: { error: { code: string; message: string; retryable: boolean } }
    }
)

export type ConversationState = {
  conversations: ConversationSummary[]
  projects: ProjectSummary[]
  messages: ChatMessage[]
  plan: ChatTodo[]
  models: ChatModelOption[]
  browser?: ChatBrowserSession
  browserFrame?: ChatBrowserFrame
  title: string
  loading: boolean
  streaming: boolean
  loadError: string
  turnError: string
  status: string
  activeAssistantId?: string
  activeConversationId?: string
  activeRunId?: string
  activeTurnId?: string
  lastSequence?: string
}

export const initialConversationState: ConversationState = {
  conversations: [],
  projects: [],
  messages: [],
  plan: [],
  models: FALLBACK_MODEL_CATALOG,
  title: 'New conversation',
  loading: true,
  streaming: false,
  loadError: '',
  turnError: '',
  status: '',
}

type ApiModelDefinition = {
  id: unknown
  provider: unknown
  label: unknown
  reasoning_efforts: unknown
  processing_modes: unknown
}

const reasoningEfforts = new Set<ChatReasoningEffort>([
  'none',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
])
const processingModes = new Set<ChatProcessingMode>(['standard', 'fast'])

const stringCapability = <T extends string>(
  value: unknown,
  allowed: ReadonlySet<T>,
): T | undefined => typeof value === 'string' && allowed.has(value as T)
  ? value as T
  : undefined

export const mapModelCatalog = (value: unknown): ChatModelOption[] => {
  if (!value || typeof value !== 'object') throw new Error('The model catalog was invalid.')
  const rawModels = (value as { models?: unknown }).models
  if (!Array.isArray(rawModels) || !rawModels.length) {
    throw new Error('The model catalog was invalid.')
  }

  const models = rawModels.map((raw): ChatModelOption | undefined => {
    if (!raw || typeof raw !== 'object') return undefined
    const model = raw as ApiModelDefinition
    const provider = model.provider === 'openai' || model.provider === 'xai'
      ? model.provider as ChatModelProvider
      : undefined
    const reasoning = model.reasoning_efforts && typeof model.reasoning_efforts === 'object'
      ? model.reasoning_efforts as { options?: unknown; default?: unknown }
      : undefined
    const processing = model.processing_modes && typeof model.processing_modes === 'object'
      ? model.processing_modes as { options?: unknown; default?: unknown }
      : undefined
    const effortOptions = Array.isArray(reasoning?.options)
      ? reasoning.options
          .map((item) => stringCapability(item, reasoningEfforts))
          .filter((item): item is ChatReasoningEffort => item !== undefined)
      : []
    const modeOptions = Array.isArray(processing?.options)
      ? processing.options
          .map((item) => stringCapability(item, processingModes))
          .filter((item): item is ChatProcessingMode => item !== undefined)
      : []
    const defaultEffort = stringCapability(reasoning?.default, reasoningEfforts)
    const defaultMode = stringCapability(processing?.default, processingModes)

    if (
      typeof model.id !== 'string' ||
      typeof model.label !== 'string' ||
      !provider ||
      !defaultEffort ||
      !effortOptions.includes(defaultEffort) ||
      !defaultMode ||
      !modeOptions.includes(defaultMode)
    ) return undefined

    return {
      value: model.id,
      label: model.label,
      provider,
      reasoningOptions: effortOptions.map((effort) => ({
        value: effort,
        label: reasoningEffortLabel(effort),
      })),
      defaultReasoningEffort: defaultEffort,
      processingModes: modeOptions,
      defaultProcessingMode: defaultMode,
    }
  }).filter((model): model is ChatModelOption => model !== undefined)

  if (!models.length) throw new Error('The model catalog was invalid.')
  return models
}

const allowedEvents = new Set<AgentEventType>(agentEventTypes)

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
  if (!response.ok) throw new Error(await parseError(response, fallback))
  return response.status === 204 ? undefined as T : response.json() as Promise<T>
}

const plainRecord = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined

const invalidStream = () => new Error('The response stream was invalid. Try again.')

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
    throw invalidStream()
  }
  if (!value || typeof value !== 'object') {
    throw invalidStream()
  }
  const event = value as Partial<StreamEvent>
  if (
    event.version !== 2 ||
    typeof event.run_id !== 'string' ||
    typeof event.turn_id !== 'string' ||
    typeof event.type !== 'string' ||
    !allowedEvents.has(event.type as StreamEvent['type']) ||
    !event.data ||
    !plainRecord(event.data) ||
    (eventName !== undefined && eventName !== event.type)
  ) {
    throw invalidStream()
  }
  parseEventSequence(event.sequence)
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
  let runId: string | undefined
  let turnId: string | undefined
  let lastSequence = -1n
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
        parseEventSequence(event.sequence) <= lastSequence ||
        (runId !== undefined && event.run_id !== runId) ||
        (turnId !== undefined && event.turn_id !== turnId) ||
        (turnId === undefined && event.type !== 'turn.started')
      ) {
        throw invalidStream()
      }
      runId ??= event.run_id
      turnId ??= event.turn_id
      lastSequence = parseEventSequence(event.sequence)
      terminal = event.type === 'turn.completed' ||
        event.type === 'turn.failed' ||
        event.type === 'user.input_required'
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

const reconcileAssistantContent = (message: ChatMessage, content: string): ChatMessage => {
  const textIndex = message.blocks.findIndex((block) => block.type === 'text')
  const textBlock: ChatMessageBlock = {
    id: `${message.id}-text`,
    type: 'text',
    content,
  }
  const blocks = textIndex >= 0
    ? message.blocks.flatMap((block, index) => index === textIndex
      ? (content ? [textBlock] : [])
      : [block])
    : content ? [...message.blocks, textBlock] : message.blocks
  return { ...message, blocks, status: 'streaming', processLabel: 'Thinking…' }
}

const searchItem = (step: SearchStep): ChatActivityItem => ({
  id: step.id,
  type: 'search',
  query: step.query || step.label,
  results: (step.sources ?? []).map(safeSource).filter(
    (source): source is SearchSource => source !== undefined,
  ),
})

const planItems = (items: unknown[]): ChatTodo[] => items.flatMap((value) => {
  const item = plainRecord(value)
  if (
    typeof item?.id !== 'string' ||
    typeof item.title !== 'string' ||
    (item.status !== 'pending' && item.status !== 'in_progress' && item.status !== 'completed')
  ) return []
  const status: ChatTodo['status'] = item.status === 'in_progress'
    ? 'in-progress'
    : item.status
  return [{
    id: item.id,
    title: item.title,
    status,
  }]
})

const upsertActivityItem = (
  assistant: ChatMessage,
  item: ChatActivityItem,
  processLabel: string,
) => {
  const existing = assistant.blocks.find((block) => block.type === 'activity')
  return {
    ...assistant,
    processLabel,
    blocks: existing && existing.type === 'activity'
      ? assistant.blocks.map((block) => block.type === 'activity'
        ? {
            ...block,
            status: 'working' as const,
            items: [...block.items.filter((entry) => entry.id !== item.id), item],
          }
        : block)
      : [{
          id: `${assistant.id}-activity`,
          type: 'activity' as const,
          status: 'working' as const,
          items: [item],
        }, ...assistant.blocks],
  }
}

const browserStatuses = new Set<ChatBrowserStatus>([
  'opening',
  'active',
  'waiting-for-user',
  'user-control',
  'agent-control',
  'closed',
  'error',
])

const mapBrowserProjection = (
  value: unknown,
  runId: string,
): ChatBrowserSession | undefined => {
  const raw = plainRecord(value)
  if (!raw) return undefined
  let normalizedStatus = typeof raw.status === 'string'
    ? raw.status.replaceAll('_', '-')
    : ''
  if (!normalizedStatus && typeof raw.state === 'string') {
    if (raw.state === 'launching') normalizedStatus = 'opening'
    else if (raw.state === 'awaiting_user') normalizedStatus = 'waiting-for-user'
    else if (raw.state === 'stopped') normalizedStatus = 'closed'
    else if (raw.state === 'failed') normalizedStatus = 'error'
    else if (raw.state === 'live' && raw.control === 'user') normalizedStatus = 'user-control'
    else if (raw.state === 'live' && raw.control === 'agent') normalizedStatus = 'agent-control'
    else if (raw.state === 'live') normalizedStatus = 'active'
  }
  if (!browserStatuses.has(normalizedStatus as ChatBrowserStatus)) return undefined
  const cursor = plainRecord(raw.cursor)
  return {
    id: typeof raw.id === 'string' ? raw.id : runId,
    runId,
    status: normalizedStatus as ChatBrowserStatus,
    ...(typeof raw.title === 'string' ? { title: raw.title } : {}),
    ...(typeof raw.url === 'string' ? { url: raw.url } : {}),
    ...(typeof raw.message === 'string' ? { message: raw.message } : {}),
    ...(cursor && typeof cursor.x === 'number' && typeof cursor.y === 'number'
      ? {
          cursor: {
            x: cursor.x,
            y: cursor.y,
            ...(typeof cursor.label === 'string' ? { label: cursor.label } : {}),
          },
        }
      : {}),
  }
}

const browserProjection = (event: StreamEvent): ChatBrowserSession | undefined => {
  const data = event.data as Record<string, unknown>
  return mapBrowserProjection(data.browser ?? data.browser_projection, event.run_id)
}

const questionPayload = (value: unknown) => {
  const data = plainRecord(value)
  return plainRecord(data?.question) ?? data
}

export const mapQuestionRequest = (
  value: unknown,
  runId: string,
): ChatQuestionRequest | undefined => {
  const question = questionPayload(value)
  if (!question) return undefined
  const id = typeof question.question_id === 'string'
    ? question.question_id
    : typeof question.id === 'string' ? question.id : undefined
  const title = typeof question.prompt === 'string'
    ? question.prompt
    : typeof question.title === 'string' ? question.title : undefined
  if (!id || !title) return undefined
  const options = Array.isArray(question.options)
    ? question.options.flatMap((value) => {
        const option = plainRecord(value)
        if (typeof option?.id !== 'string' || typeof option.label !== 'string') return []
        return [{
          value: option.id,
          label: option.label,
          ...(typeof option.description === 'string'
            ? { description: option.description }
            : {}),
        }]
      })
    : []
  return {
    id,
    runId,
    title: 'Input needed',
    questions: [{
      id,
      title,
      ...(typeof question.description === 'string'
        ? { description: question.description }
        : {}),
      ...(options.length ? { options } : {}),
      multiple: question.multiple === true,
      allowCustom: question.allow_custom === true,
      customPlaceholder: 'Type your answer…',
    }],
    status: 'pending',
  }
}

export const answerForQuestion = (
  request: ChatQuestionRequest,
  answers: ChatQuestionAnswers,
): { questionId: string; answer: string | string[] } | undefined => {
  const question = request.questions.find((item) => answers[item.id]) ?? request.questions[0]
  const response = question ? answers[question.id] : undefined
  const custom = response?.custom?.trim()
  if (custom) return { questionId: question.id, answer: custom }
  if (!question || !response?.selected.length) return undefined
  return {
    questionId: question.id,
    answer: question.multiple ? response.selected : response.selected[0],
  }
}

export const mapBrowserFrame = (value: unknown): ChatBrowserFrame | undefined => {
  const frame = plainRecord(value)
  if (!frame) return undefined
  const nested = plainRecord(frame.frame) ?? frame
  const src = typeof nested.src === 'string'
    ? nested.src
    : typeof nested.base64 === 'string' &&
        (nested.mime_type === 'image/png' || nested.mime_type === 'image/jpeg')
      ? `data:${nested.mime_type};base64,${nested.base64}`
    : typeof nested.jpegBase64 === 'string'
      ? `data:image/jpeg;base64,${nested.jpegBase64}`
      : typeof nested.jpeg_base64 === 'string'
        ? `data:image/jpeg;base64,${nested.jpeg_base64}`
        : undefined
  if (!src) return undefined
  return {
    src,
    ...(typeof nested.alt === 'string' ? { alt: nested.alt } : {}),
  }
}

type BrowserFrameEnvelope = {
  version: 2
  run_id: string
  type: 'browser.frame'
  data: unknown
}

export const parseSocketMessage = (
  value: unknown,
): StreamEvent | BrowserFrameEnvelope => {
  if (typeof value !== 'string') throw invalidStream()
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw invalidStream()
  }
  const candidate = plainRecord(parsed)
  if (
    candidate?.version === 2 &&
    candidate.type === 'browser.frame' &&
    typeof candidate.run_id === 'string' &&
    plainRecord(candidate.data)
  ) {
    return candidate as BrowserFrameEnvelope
  }
  const event = candidate as Partial<StreamEvent> | undefined
  if (
    event?.version !== 2 ||
    typeof event.run_id !== 'string' ||
    typeof event.turn_id !== 'string' ||
    typeof event.type !== 'string' ||
    !allowedEvents.has(event.type as AgentEventType) ||
    !plainRecord(event.data)
  ) throw invalidStream()
  parseEventSequence(event.sequence)
  return event as StreamEvent
}

export const agentRunSocketUrl = (
  runId: string,
  after: string,
  origin: string,
) => {
  parseEventSequence(after)
  const url = new URL(apiBase || origin, origin)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = `${url.pathname.replace(/\/$/, '')}/agent-runs/${encodeURIComponent(runId)}/subscribe`
  url.search = new URLSearchParams({ after }).toString()
  return url.toString()
}

export const applyStreamEvent = (
  state: ConversationState,
  event: StreamEvent,
): ConversationState => {
  const eventState: ConversationState = {
    ...state,
    browser: browserProjection(event) ?? state.browser,
    activeRunId: event.run_id,
    activeTurnId: event.turn_id,
    lastSequence: event.sequence,
  }
  if (event.type === 'turn.started') {
    if ('checkpoint' in event.data) {
      const checkpoint = event.data.checkpoint
      return {
        ...eventState,
        messages: updateAssistant(
          state.messages,
          state.activeAssistantId,
          (assistant) => reconcileAssistantContent(assistant, checkpoint.content),
        ),
        loading: false,
        streaming: true,
        status: 'Responding…',
      }
    }
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
      ...eventState,
      conversations: upsertConversation(state.conversations, event.data.conversation),
      messages,
      plan: Array.isArray(event.data.plan) ? planItems(event.data.plan) : state.plan,
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
      ...eventState,
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
      ...eventState,
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
      ...eventState,
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

  if (event.type === 'plan.updated') {
    return {
      ...eventState,
      plan: planItems(event.data.plan),
    }
  }

  if (
    event.type === 'tool.started' ||
    event.type === 'tool.updated' ||
    event.type === 'tool.completed'
  ) {
    const tool = event.data.tool
    const item: ChatActivityItem = {
      id: tool.id,
      type: 'tool',
      action: tool.name || 'tool',
      target: tool.label || tool.name || 'Tool activity',
    }
    return {
      ...eventState,
      messages: updateAssistant(state.messages, state.activeAssistantId, (assistant) =>
        upsertActivityItem(assistant, item, event.type === 'tool.completed' ? 'Thinking…' : 'Running tools…')),
    }
  }

  if (event.type === 'child.started' || event.type === 'child.completed') {
    const child = event.data.child
    const item: ChatActivityItem = {
      id: child.id,
      type: 'trace',
      kind: 'message',
      label: child.label || 'Child agent',
      detail: child.name,
    }
    return {
      ...eventState,
      messages: updateAssistant(state.messages, state.activeAssistantId, (assistant) =>
        upsertActivityItem(assistant, item, event.type === 'child.completed' ? 'Thinking…' : 'Delegating…')),
    }
  }

  if (event.type === 'user.input_required') {
    const request = mapQuestionRequest(event.data, event.run_id)
    if (!request) {
      return { ...eventState, turnError: 'The requested input could not be displayed.' }
    }
    return {
      ...eventState,
      messages: updateAssistant(state.messages, state.activeAssistantId, (assistant) => ({
        ...assistant,
        processLabel: undefined,
        processDuration: elapsedProcessDuration(assistant),
        blocks: [
          ...terminalBlocks(assistant.blocks).filter((block) =>
            block.type !== 'question' || block.request.id !== request.id),
          {
            id: `${assistant.id}-question-${request.id}`,
            type: 'question',
            request,
          },
        ],
      })),
      streaming: false,
      status: 'Waiting for your input…',
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
    ...eventState,
    conversations,
    messages: updateAssistant(state.messages, state.activeAssistantId, (assistant) => ({
      ...assistant,
      blocks: terminalBlocks(assistant.blocks).map((block) =>
        block.type === 'question' &&
        (block.request.status === 'pending' || block.request.status === 'submitting')
          ? {
              ...block,
              request: {
                ...block.request,
                status: 'cancelled' as const,
                result: cancelled ? 'Run cancelled.' : 'Run ended.',
              },
            }
          : block),
      status: failed && !cancelled ? 'error' : 'complete',
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
    activeRunId: undefined,
    activeTurnId: undefined,
    browser: state.browser
      ? { ...state.browser, status: 'closed', message: 'Browser preview ended with the run.' }
      : undefined,
    browserFrame: undefined,
  }
}

type ActiveRunProjection = {
  id: string
  turn_id: string
  status: string
  last_event_sequence: string | null
  plan: unknown[]
  pending_question: unknown
  browser_projection: unknown
}

type ConversationDetail = ConversationSummary & {
  messages: ApiConversationMessage[]
  plan?: unknown[]
  active_run?: unknown
}

const parseActiveRun = (value: unknown): ActiveRunProjection | undefined => {
  if (value === null || value === undefined) return undefined
  const run = plainRecord(value)
  if (
    typeof run?.id !== 'string' ||
    typeof run.turn_id !== 'string' ||
    typeof run.status !== 'string' ||
    (run.last_event_sequence !== null && run.last_event_sequence !== undefined &&
      typeof run.last_event_sequence !== 'string')
  ) throw new Error('The active run projection was invalid.')
  const sequence = run.last_event_sequence ?? null
  if (sequence !== null) parseEventSequence(sequence)
  return {
    id: run.id,
    turn_id: run.turn_id,
    status: run.status,
    last_event_sequence: sequence,
    plan: Array.isArray(run.plan) ? run.plan : [],
    pending_question: run.pending_question,
    browser_projection: run.browser_projection,
  }
}

export const rehydrateConversationDetail = (
  current: ConversationState,
  detail: ConversationDetail,
): ConversationState => {
  const run = parseActiveRun(detail.active_run)
  const plan = planItems(Array.isArray(detail.plan) ? detail.plan : run?.plan ?? [])
  let messages = detail.messages.map(mapApiMessage)
  if (!run) {
    return {
      ...current,
      messages,
      plan,
      title: detail.title,
      streaming: false,
      status: '',
      activeAssistantId: undefined,
      activeConversationId: detail.id,
      activeRunId: undefined,
      activeTurnId: undefined,
      lastSequence: undefined,
      browser: undefined,
      browserFrame: undefined,
    }
  }

  const assistantIndex = detail.messages.findLastIndex((message) =>
    message.role === 'assistant' &&
    (message.status === 'streaming' || message.status === 'waiting'))
  const fallbackAssistantIndex = messages.findLastIndex((message) => message.role === 'assistant')
  const activeAssistantIndex = assistantIndex >= 0 ? assistantIndex : fallbackAssistantIndex
  const activeAssistantId = messages[activeAssistantIndex]?.id
  if (activeAssistantIndex >= 0) {
    const assistant = messages[activeAssistantIndex]
    const question = mapQuestionRequest(run.pending_question, run.id)
    const baseBlocks = assistant.blocks.filter((block) =>
      block.type !== 'todo-list' &&
      (block.type !== 'question' || block.request.id !== question?.id))
    messages = messages.with(activeAssistantIndex, {
      ...assistant,
      status: run.status === 'waiting' ? 'complete' : 'streaming',
      processLabel: run.status === 'waiting' ? undefined : 'Thinking…',
      blocks: [
        ...baseBlocks,
        ...(question ? [{
          id: `${assistant.id}-question-${question.id}`,
          type: 'question' as const,
          request: question,
        }] : []),
      ],
    })
  }

  return {
    ...current,
    messages,
    plan,
    title: detail.title,
    streaming: run.status !== 'waiting',
    status: run.status === 'waiting'
      ? 'Waiting for your input…'
      : run.status === 'cancelling' ? 'Cancelling…' : 'Responding…',
    activeAssistantId,
    activeConversationId: detail.id,
    activeRunId: run.id,
    activeTurnId: run.turn_id,
    lastSequence: run.last_event_sequence ?? '0',
    browser: mapBrowserProjection(run.browser_projection, run.id),
    browserFrame: undefined,
  }
}

export function useConversation(
  conversationId: string | undefined,
  onStarted?: (id: string) => void,
) {
  const [state, setState] = useState<ConversationState>(initialConversationState)
  const stateRef = useRef(state)
  const routeConversationRef = useRef(conversationId)
  const streamConversationRef = useRef<string | undefined>(undefined)
  const streamAbortRef = useRef<AbortController | null>(null)
  const detachedStreamsRef = useRef(new WeakSet<AbortController>())
  const loadAbortRef = useRef<AbortController | null>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const socketRunRef = useRef<string | undefined>(undefined)
  const socketCursorRef = useRef(0n)
  const socketGenerationRef = useRef(0)
  const reconnectTimerRef = useRef<number | undefined>(undefined)
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

  const closeRunSocket = useCallback(() => {
    socketGenerationRef.current += 1
    if (reconnectTimerRef.current !== undefined) {
      window.clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = undefined
    }
    socketRunRef.current = undefined
    const socket = socketRef.current
    socketRef.current = null
    if (socket && socket.readyState < 2) socket.close(1000, 'Detached')
  }, [])

  const connectRun = useCallback((runId: string, after?: string) => {
    const currentSocket = socketRef.current
    if (
      socketRunRef.current === runId &&
      currentSocket &&
      currentSocket.readyState < 2
    ) return

    closeRunSocket()
    const initialCursor = after ?? stateRef.current.lastSequence ?? '0'
    socketCursorRef.current = parseEventSequence(initialCursor)
    socketRunRef.current = runId
    const generation = socketGenerationRef.current
    let reconnectAttempt = 0

    const open = () => {
      if (
        socketGenerationRef.current !== generation ||
        socketRunRef.current !== runId
      ) return
      const socket = new WebSocket(agentRunSocketUrl(
        runId,
        socketCursorRef.current.toString(),
        window.location.origin,
      ))
      socketRef.current = socket
      socket.onmessage = (message) => {
        if (
          socketGenerationRef.current !== generation ||
          socketRunRef.current !== runId
        ) return
        try {
          const parsed = parseSocketMessage(message.data)
          if (parsed.run_id !== runId) throw invalidStream()
          reconnectAttempt = 0
          if (parsed.type === 'browser.frame') {
            const frame = mapBrowserFrame(parsed.data)
            if (frame) {
              setState((current) => current.activeRunId && current.activeRunId !== runId
                ? current
                : { ...current, browserFrame: frame })
            }
            return
          }
          const sequence = parseEventSequence(parsed.sequence)
          if (sequence <= socketCursorRef.current) return
          socketCursorRef.current = sequence
          if (!streamAbortRef.current) {
            setState((current) => current.activeRunId && current.activeRunId !== runId
              ? current
              : applyStreamEvent(current, parsed))
          }
          if (terminalEventTypes.has(parsed.type)) {
            socketRunRef.current = undefined
            socketRef.current = null
            socket.close(1000, 'Run completed')
          }
        } catch (error) {
          socketRunRef.current = undefined
          socketRef.current = null
          setState((current) => ({
            ...current,
            turnError: error instanceof Error
              ? error.message
              : 'The response stream was invalid. Try again.',
          }))
          socket.close(1002, 'Invalid event')
        }
      }
      socket.onerror = () => socket.close()
      socket.onclose = () => {
        if (socketRef.current === socket) socketRef.current = null
        if (
          socketGenerationRef.current !== generation ||
          socketRunRef.current !== runId
        ) return
        const delay = Math.min(1_000 * (2 ** reconnectAttempt), 10_000)
        reconnectAttempt += 1
        reconnectTimerRef.current = window.setTimeout(open, delay)
      }
    }

    open()
  }, [closeRunSocket])

  const detach = useCallback(() => {
    const controller = streamAbortRef.current
    if (controller) {
      detachedStreamsRef.current.add(controller)
      controller.abort()
      streamAbortRef.current = null
    }
    streamConversationRef.current = undefined
    closeRunSocket()
  }, [closeRunSocket])

  const load = useCallback(async (id = routeConversationRef.current) => {
    loadAbortRef.current?.abort()
    const controller = new AbortController()
    loadAbortRef.current = controller
    setState((current) => ({ ...current, loading: true, loadError: '', turnError: '' }))
    try {
      const [list, projects, catalog, detail] = await Promise.all([
        request<{ conversations: ConversationSummary[] }>('/conversations', {
          signal: controller.signal,
        }),
        request<{ projects: ProjectSummary[] }>('/projects', {
          signal: controller.signal,
        }),
        request<unknown>('/models', { signal: controller.signal }, 'Unable to load models.')
          .then(mapModelCatalog)
          .catch(() => FALLBACK_MODEL_CATALOG),
        id
          ? request<ConversationDetail>(`/conversations/${id}`, { signal: controller.signal })
          : Promise.resolve(undefined),
      ])
      if (controller.signal.aborted) return
      const run = detail ? parseActiveRun(detail.active_run) : undefined
      setState((current) => {
        const loaded = detail
          ? rehydrateConversationDetail(current, detail)
          : {
              ...current,
              messages: [],
              plan: [],
              title: 'New conversation',
              streaming: false,
              status: '',
              activeAssistantId: undefined,
              activeConversationId: undefined,
              activeRunId: undefined,
              activeTurnId: undefined,
              lastSequence: undefined,
              browser: undefined,
              browserFrame: undefined,
            }
        return {
          ...loaded,
          conversations: list.conversations,
          projects: projects.projects,
          models: catalog,
          loading: false,
          loadError: '',
        }
      })
      if (run && id) {
        streamConversationRef.current = id
        connectRun(run.id, run.last_event_sequence ?? '0')
      }
    } catch (error) {
      if (controller.signal.aborted) return
      setState((current) => ({
        ...current,
        loading: false,
        loadError: error instanceof Error ? error.message : 'Unable to load conversations.',
      }))
    }
  }, [connectRun])

  useEffect(() => {
    if (
      conversationId === streamConversationRef.current &&
      (streamAbortRef.current || socketRunRef.current)
    ) return
    detach()
    void load(conversationId)
  }, [conversationId, detach, load])

  useEffect(() => () => {
    detach()
    loadAbortRef.current?.abort()
  }, [detach])

  const send = useCallback(async (
    message: string,
    model: ModelName,
    reasoningEffort: ReasoningEffort,
    speed: Speed,
  ) => {
    if (stateRef.current.streaming || stateRef.current.activeRunId) return
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
        if (controller.signal.aborted) return
        if (event.type === 'turn.started' && 'conversation' in event.data) {
          streamConversationRef.current = event.data.conversation.id
          onStartedRef.current?.(event.data.conversation.id)
          connectRun(event.run_id, event.sequence)
        }
        setState((current) => applyStreamEvent(current, event))
      })
    } catch (error) {
      const cancelled = controller.signal.aborted
      if (detachedStreamsRef.current.has(controller)) return
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
  }, [connectRun])

  const stop = useCallback(() => {
    const runId = stateRef.current.activeRunId
    if (runId) {
      setState((current) => ({ ...current, status: 'Cancelling…' }))
      void request(`/agent-runs/${runId}/cancel`, { method: 'POST' }, 'Unable to stop the run.')
        .then(() => {
          if (!streamAbortRef.current) connectRun(runId)
        })
        .catch((error) => setState((current) => ({
          ...current,
          status: '',
          turnError: error instanceof Error ? error.message : 'Unable to stop the run.',
        })))
      return
    }
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
  }, [connectRun])

  const decideApproval = useCallback((blockId: string, decision: ChatApprovalDecision) => {
    setState((current) => ({
      ...current,
      messages: current.messages.map((message) => ({
        ...message,
        blocks: message.blocks.map((block) => block.id === blockId && block.type === 'tool-approval'
          ? {
              ...block,
              approval: {
                ...block.approval,
                status: decision === 'deny' ? 'denied' : 'approved',
              },
            }
          : block),
      })),
    }))
  }, [])

  const answerQuestion = useCallback(async (
    question: ChatQuestionRequest,
    answers: ChatQuestionAnswers,
  ) => {
    const response = answerForQuestion(question, answers)
    if (!response) return
    const updateStatus = (status: ChatQuestionRequest['status'], result?: string) => {
      setState((current) => ({
        ...current,
        messages: current.messages.map((message) => ({
          ...message,
          blocks: message.blocks.map((block) =>
            block.type === 'question' && block.request.id === question.id
              ? {
                  ...block,
                  request: { ...block.request, status, answers, ...(result ? { result } : {}) },
                }
              : block),
        })),
      }))
    }
    updateStatus('submitting')
    try {
      await request(`/agent-runs/${question.runId}/resume`, {
        method: 'POST',
        body: JSON.stringify({
          question_id: response.questionId,
          answer: response.answer,
        }),
      }, 'Unable to submit the answer.')
      updateStatus('answered', 'Answer submitted')
      setState((current) => ({
        ...current,
        streaming: true,
        status: 'Responding…',
        messages: updateAssistant(current.messages, current.activeAssistantId, (assistant) => ({
          ...assistant,
          status: 'streaming',
          processLabel: 'Thinking…',
        })),
      }))
      connectRun(question.runId)
    } catch (error) {
      updateStatus('error', error instanceof Error ? error.message : 'Unable to submit the answer.')
    }
  }, [connectRun])

  const remove = useCallback(async (id: string) => {
    await request<void>(`/conversations/${id}`, { method: 'DELETE' })
    setState((current) => ({
      ...current,
      conversations: current.conversations.filter((conversation) => conversation.id !== id),
    }))
  }, [])

  const createProject = useCallback(async (name: string) => {
    const project = await request<ProjectSummary>('/projects', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }, 'Unable to create the project. Try again.')
    setState((current) => ({
      ...current,
      projects: [project, ...current.projects],
    }))
    return project
  }, [])

  const moveToProject = useCallback(async (conversationId: string, projectId: string | null) => {
    const updated = await request<ConversationSummary>(
      `/conversations/${conversationId}/project`,
      {
        method: 'PATCH',
        body: JSON.stringify({ project_id: projectId }),
      },
      'Unable to move the conversation. Try again.',
    )
    setState((current) => ({
      ...current,
      conversations: current.conversations.map((conversation) =>
        conversation.id === conversationId ? updated : conversation),
    }))
    return updated
  }, [])

  return {
    ...state,
    send,
    stop,
    detach,
    decideApproval,
    answerQuestion,
    remove,
    createProject,
    moveToProject,
    reload: () => load(),
  }
}
