import type {
  ApiConversationMessage,
  ChatActivityItem,
  ChatBrowserFrame,
  ChatBrowserSession,
  ChatBrowserStatus,
  ChatMessage,
  ChatMessageBlock,
  ChatModelOption,
  ChatModelProvider,
  ChatProcessingMode,
  ChatQuestionAnswers,
  ChatQuestionRequest,
  ChatReasoningEffort,
  ChatTodo,
  ConversationSummary,
  ProjectSummary,
} from '../model'
import { FALLBACK_MODEL_CATALOG, reasoningEffortLabel } from '../model-catalog'

const configuredApiBase = import.meta.env.VITE_API_BASE_URL?.trim()
if (import.meta.env.PROD && !configuredApiBase) {
  throw new Error('VITE_API_BASE_URL must be configured for production.')
}
const apiBase = (configuredApiBase || '').replace(/\/$/, '')

export type ModelName = string
export type ReasoningEffort = ChatReasoningEffort
export type Speed = ChatProcessingMode

export type SearchStep = {
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
  'conversation.title.updated',
  'user.input_required',
  'tool.started',
  'tool.updated',
  'tool.completed',
  'child.started',
  'child.completed',
  'turn.completed',
  'turn.failed',
] as const

export type AgentEventType = (typeof agentEventTypes)[number]
type EventEnvelope = {
  version: 2
  sequence: string
  run_id: string
  turn_id: string
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

type ToolStep = {
  id: string
  name?: string
  label?: string
  status?: string
}

export type StreamEvent = EventEnvelope & (
  | { type: 'turn.started'; data: InitialTurnStartedData | ReconciledTurnStartedData }
  | { type: 'reasoning.delta' | 'text.delta'; data: { delta: string } }
  | { type: 'step.started' | 'step.updated' | 'step.completed'; data: { step: SearchStep } }
  | { type: 'plan.updated'; data: { plan: unknown[] } }
  | { type: 'conversation.title.updated'; data: { conversation: ConversationSummary } }
  | { type: 'user.input_required'; data: Record<string, unknown> }
  | { type: 'tool.started' | 'tool.updated' | 'tool.completed'; data: { tool: ToolStep } }
  | { type: 'child.started' | 'child.completed'; data: { child: ToolStep } }
  | { type: 'turn.completed'; data: Record<string, unknown> }
  | {
      type: 'turn.failed'
      data: { error: { code: string; message: string; retryable: boolean } }
    }
)

export type ActiveRunStatus = 'queued' | 'running' | 'waiting' | 'cancelling'

export type ActiveRunProjection = {
  id: string
  conversation_id: string
  turn_id: string
  status: ActiveRunStatus
  last_event_sequence: string | null
  plan: unknown[]
  pending_question: unknown
  browser_projection: unknown
}

export type ConversationDetail = ConversationSummary & {
  messages: ApiConversationMessage[]
  plan?: unknown[]
  active_run?: unknown
}

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

const allowedEvents = new Set<AgentEventType>(agentEventTypes)
const canonicalSequence = /^(0|[1-9]\d*)$/

export const parseEventSequence = (value: unknown): bigint => {
  if (typeof value !== 'string' || !canonicalSequence.test(value)) {
    throw new Error('The response stream was invalid. Try again.')
  }
  return BigInt(value)
}

const plainRecord = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined

const invalidStream = () => new Error('The response stream was invalid. Try again.')

const isActivityItem = (value: unknown): value is ChatActivityItem => {
  const item = plainRecord(value)
  return typeof item?.id === 'string' && typeof item.type === 'string'
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
    ...(message.status === 'failed'
      ? { errorMessage: message.error_message || 'The response could not be completed.' }
      : {}),
    status: message.status === 'streaming'
      ? 'streaming'
      : message.status === 'failed'
        ? 'error'
        : 'complete',
    ...(processDuration !== undefined ? { processDuration } : {}),
  }
}

const reasoningEfforts = new Set<ChatReasoningEffort>([
  'none', 'low', 'medium', 'high', 'xhigh', 'max',
])
const processingModes = new Set<ChatProcessingMode>(['standard', 'fast'])

const stringCapability = <T extends string>(
  value: unknown,
  allowed: ReadonlySet<T>,
): T | undefined => typeof value === 'string' && allowed.has(value as T)
  ? value as T
  : undefined

export const mapModelCatalog = (value: unknown): ChatModelOption[] => {
  const rawModels = plainRecord(value)?.models
  if (!Array.isArray(rawModels) || !rawModels.length) {
    throw new Error('The model catalog was invalid.')
  }
  const models = rawModels.flatMap((raw): ChatModelOption[] => {
    const model = plainRecord(raw)
    const provider = model?.provider === 'openai' ||
      model?.provider === 'xai' ||
      model?.provider === 'openrouter'
      ? model.provider as ChatModelProvider
      : undefined
    const reasoning = plainRecord(model?.reasoning_efforts)
    const processing = plainRecord(model?.processing_modes)
    const effortOptions = Array.isArray(reasoning?.options)
      ? reasoning.options.flatMap((item) => {
          const effort = stringCapability(item, reasoningEfforts)
          return effort ? [effort] : []
        })
      : []
    const modeOptions = Array.isArray(processing?.options)
      ? processing.options.flatMap((item) => {
          const mode = stringCapability(item, processingModes)
          return mode ? [mode] : []
        })
      : []
    const defaultEffort = stringCapability(reasoning?.default, reasoningEfforts)
    const defaultMode = stringCapability(processing?.default, processingModes)
    if (
      typeof model?.id !== 'string' ||
      typeof model.label !== 'string' ||
      typeof model.company !== 'string' ||
      !provider ||
      !defaultEffort ||
      !effortOptions.includes(defaultEffort) ||
      !defaultMode ||
      !modeOptions.includes(defaultMode)
    ) return []
    return [{
      value: model.id,
      label: model.label,
      provider,
      company: model.company,
      reasoningOptions: effortOptions.map((effort) => ({
        value: effort,
        label: reasoningEffortLabel(effort),
      })),
      defaultReasoningEffort: defaultEffort,
      processingModes: modeOptions,
      defaultProcessingMode: defaultMode,
    }]
  })
  if (!models.length) throw new Error('The model catalog was invalid.')
  return models
}

export const mapPlanItems = (items: unknown[]): ChatTodo[] => items.flatMap((value) => {
  const item = plainRecord(value)
  if (
    typeof item?.id !== 'string' ||
    typeof item.title !== 'string' ||
    (item.status !== 'pending' && item.status !== 'in_progress' && item.status !== 'completed')
  ) return []
  return [{
    id: item.id,
    title: item.title,
    status: item.status === 'in_progress' ? 'in-progress' : item.status,
  }]
})

const browserStatuses = new Set<ChatBrowserStatus>([
  'opening', 'active', 'waiting-for-user', 'user-control', 'agent-control', 'closed', 'error',
])

export const mapBrowserProjection = (
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
          ...(typeof option.description === 'string' ? { description: option.description } : {}),
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
      ...(typeof question.description === 'string' ? { description: question.description } : {}),
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
      : undefined
  if (!src) return undefined
  return { src, ...(typeof nested.alt === 'string' ? { alt: nested.alt } : {}) }
}

export const parseActiveRunProjection = (value: unknown): ActiveRunProjection | undefined => {
  if (value === null || value === undefined) return undefined
  const run = plainRecord(value)
  if (
    typeof run?.id !== 'string' ||
    typeof run.conversation_id !== 'string' ||
    typeof run.turn_id !== 'string' ||
    (run.status !== 'queued' && run.status !== 'running' &&
      run.status !== 'waiting' && run.status !== 'cancelling') ||
    (run.last_event_sequence !== null && run.last_event_sequence !== undefined &&
      typeof run.last_event_sequence !== 'string')
  ) throw new Error('The active run projection was invalid.')
  const sequence = run.last_event_sequence ?? null
  if (sequence !== null) parseEventSequence(sequence)
  return {
    id: run.id,
    conversation_id: run.conversation_id,
    turn_id: run.turn_id,
    status: run.status,
    last_event_sequence: sequence,
    plan: Array.isArray(run.plan) ? run.plan : [],
    pending_question: run.pending_question,
    browser_projection: run.browser_projection,
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

export async function loadConversationCatalog(signal?: AbortSignal) {
  const [conversationResult, projectResult, activeRunResult, models] = await Promise.all([
    request<{ conversations: ConversationSummary[] }>('/conversations', { signal }),
    request<{ projects: ProjectSummary[] }>('/projects', { signal }),
    request<{ runs: unknown[]; conversations: ConversationSummary[] }>(
      '/agent-runs',
      { signal },
      'Unable to load active runs.',
    ),
    request<unknown>('/models', { signal }, 'Unable to load models.')
      .then(mapModelCatalog)
      .catch((error) => {
        if (signal?.aborted) throw error
        return FALLBACK_MODEL_CATALOG
      }),
  ])
  return {
    conversations: [
      ...conversationResult.conversations,
      ...activeRunResult.conversations,
    ],
    projects: projectResult.projects,
    activeRuns: activeRunResult.runs.map((run) => {
      const parsed = parseActiveRunProjection(run)
      if (!parsed) throw new Error('The active run catalog was invalid.')
      return parsed
    }),
    models,
  }
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

export function cancelAgentRun(runId: string) {
  return request(`/agent-runs/${runId}/cancel`, { method: 'POST' }, 'Unable to stop the run.')
}

export function resumeAgentRun(
  runId: string,
  questionId: string,
  answer: string | string[],
) {
  return request(`/agent-runs/${runId}/resume`, {
    method: 'POST',
    body: JSON.stringify({ question_id: questionId, answer }),
  }, 'Unable to submit the answer.')
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
  let parsed: unknown
  try {
    parsed = JSON.parse(dataLines.join('\n'))
  } catch {
    throw invalidStream()
  }
  const event = plainRecord(parsed) as Partial<StreamEvent> | undefined
  if (
    event?.version !== 2 ||
    typeof event.run_id !== 'string' ||
    typeof event.turn_id !== 'string' ||
    typeof event.type !== 'string' ||
    !allowedEvents.has(event.type as AgentEventType) ||
    !plainRecord(event.data) ||
    (eventName !== undefined && eventName !== event.type)
  ) throw invalidStream()
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
      const sequence = parseEventSequence(event.sequence)
      if (
        terminal ||
        sequence <= lastSequence ||
        (runId !== undefined && event.run_id !== runId) ||
        (turnId !== undefined && event.turn_id !== turnId) ||
        (turnId === undefined && event.type !== 'turn.started')
      ) throw invalidStream()
      runId ??= event.run_id
      turnId ??= event.turn_id
      lastSequence = sequence
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

type BrowserFrameEnvelope = {
  version: 2
  run_id: string
  type: 'browser.frame'
  data: unknown
}

export const parseSocketMessage = (value: unknown): StreamEvent | BrowserFrameEnvelope => {
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
  ) return candidate as BrowserFrameEnvelope
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
