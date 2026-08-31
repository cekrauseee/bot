import type { Settings } from '../config.js'
import { requestIdsFor, requestHeaders, setRequestOutcome } from '../logger.js'
import type { Logger } from 'pino'
import type {
  Conversation,
  ConversationRepository,
  Message,
} from '../db/repository.js'

export type ModelName = 'gpt-5.6-sol' | 'gpt-5.6-luna'
export type ReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
export type Speed = 'standard' | 'fast'

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

type ProviderEvent = {
  version: 1
  sequence: number
  turn_id: string
  type:
    | 'turn.started'
    | 'reasoning.delta'
    | 'text.delta'
    | 'step.started'
    | 'step.updated'
    | 'step.completed'
    | 'turn.completed'
    | 'turn.failed'
  data: Record<string, unknown>
}

type ProviderStep = {
  id: string
  kind: 'web_search'
  status: 'in_progress' | 'completed'
  label: string
  query?: string
  sources?: unknown[]
}

export type SearchSource = {
  id: string
  title: string
  domain?: string
  url?: string
}

export type SearchActivity = {
  id: string
  type: 'search'
  query: string
  results?: SearchSource[]
}

type ConversationStore = Pick<ConversationRepository, 'transcript' | 'updateAssistant'>

const providerEventTypes = new Set<ProviderEvent['type']>([
  'turn.started',
  'reasoning.delta',
  'text.delta',
  'step.started',
  'step.updated',
  'step.completed',
  'turn.completed',
  'turn.failed',
])

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

const sse = (type: string, envelope: unknown) =>
  `event: ${type}\ndata: ${JSON.stringify(envelope)}\n\n`

const parseEventBlock = (block: string): ProviderEvent | undefined => {
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
    throw new Error('invalid_provider_event')
  }
  if (!value || typeof value !== 'object') throw new Error('invalid_provider_event')
  const candidate = value as Partial<ProviderEvent>
  if (
    candidate.version !== 1 ||
    !Number.isInteger(candidate.sequence) ||
    typeof candidate.turn_id !== 'string' ||
    typeof candidate.type !== 'string' ||
    !providerEventTypes.has(candidate.type as ProviderEvent['type']) ||
    !candidate.data ||
    typeof candidate.data !== 'object' ||
    (eventName !== undefined && eventName !== candidate.type)
  ) {
    throw new Error('invalid_provider_event')
  }
  return candidate as ProviderEvent
}

export const parseProviderEvents = (input: string) => {
  const events: ProviderEvent[] = []
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

const normalizedSource = (value: unknown, index: number, stepId: string) => {
  if (!value || typeof value !== 'object') return undefined
  const candidate = value as Record<string, unknown>
  const rawUrl = typeof candidate.url === 'string' ? candidate.url : undefined
  let url: string | undefined
  let domain = typeof candidate.domain === 'string' ? candidate.domain : undefined
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
  const title = typeof candidate.title === 'string' ? candidate.title.trim() : ''
  if (!title && !url) return undefined
  return {
    id: typeof candidate.id === 'string' ? candidate.id : `${stepId}-${index}`,
    title: title || url!,
    ...(domain ? { domain } : {}),
    ...(url ? { url } : {}),
  }
}

const upsertActivity = (activities: SearchActivity[], rawStep: unknown) => {
  if (!rawStep || typeof rawStep !== 'object') throw new Error('invalid_provider_event')
  const step = rawStep as Partial<ProviderStep>
  if (!step.id || step.kind !== 'web_search') throw new Error('invalid_provider_event')
  const sources = Array.isArray(step.sources)
    ? step.sources
        .map((source, index) => normalizedSource(source, index, step.id!))
        .filter((source): source is SearchSource => source !== undefined)
    : []
  const current = activities.find((activity) => activity.id === step.id)
  const activity: SearchActivity = {
    id: step.id,
    type: 'search',
    query: step.query ?? current?.query ?? step.label ?? 'Web search',
    ...(sources.length ? { results: sources } : current?.results ? { results: current.results } : {}),
  }
  const index = activities.findIndex((item) => item.id === activity.id)
  if (index === -1) activities.push(activity)
  else activities[index] = activity
}

class ProviderFailure extends Error {
  constructor(readonly detail?: Record<string, unknown>) {
    super('provider_failed')
  }
}

export async function streamTurn(
  repository: ConversationStore,
  conversation: Conversation,
  userId: string,
  turnId: string,
  options: TurnOptions,
  ai: AiClient,
  request: Request,
  created: { user: Message; assistant: Message },
  logger?: Logger,
) {
  const transcript = await repository.transcript(conversation.id)
  const controller = new AbortController()
  const abort = () => controller.abort()
  if (request.signal.aborted) controller.abort()
  else request.signal.addEventListener('abort', abort, { once: true })

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(target) {
      let content = ''
      let reasoning = ''
      const activities: SearchActivity[] = []
      let publicSequence = 0
      let lastProviderSequence = -1
      let terminal: 'completed' | 'failed' | undefined
      let completedData: Record<string, unknown> = {}
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
      let targetOpen = true

      const send = (type: ProviderEvent['type'], data: Record<string, unknown>) => {
        if (!targetOpen) return
        const envelope = { version: 1, sequence: publicSequence++, turn_id: turnId, type, data }
        try {
          target.enqueue(encoder.encode(sse(type, envelope)))
        } catch {
          targetOpen = false
          controller.abort()
        }
      }

      try {
        logger?.info({ event: 'chat_turn_started', conversation_id: conversation.id, turn_id: turnId, user_id: userId }, 'chat_turn_started')
        send('turn.started', {
          conversation: publicConversation(conversation),
          user_message: publicMessage(created.user),
          assistant_message: publicMessage(created.assistant),
        })
        const response = await ai(
          {
            version: 1,
            turn_id: turnId,
            conversation_id: conversation.id,
            user_id: userId,
            messages: transcript.map(({ role, content: messageContent }) => ({
              role,
              content: messageContent,
            })),
            model: options.model,
            reasoning_effort: options.reasoning_effort,
            speed: options.speed,
          },
          controller.signal,
          requestHeaders(requestIdsFor(request)),
        )
        if (!response.ok || !response.body) throw new Error('provider_unavailable')

        reader = response.body.getReader()
        const decoder = new TextDecoder()
        let pending = ''
        const consume = (event: ProviderEvent) => {
          if (event.turn_id !== turnId || event.sequence <= lastProviderSequence || terminal) {
            throw new Error('invalid_provider_event')
          }
          lastProviderSequence = event.sequence
          if (event.type === 'turn.started') return
          if (event.type === 'text.delta') {
            const delta = event.data.delta
            if (typeof delta !== 'string') throw new Error('invalid_provider_event')
            content += delta
            send(event.type, event.data)
            return
          }
          if (event.type === 'reasoning.delta') {
            const delta = event.data.delta
            if (typeof delta !== 'string') throw new Error('invalid_provider_event')
            reasoning += delta
            send(event.type, event.data)
            return
          }
          if (event.type.startsWith('step.')) {
            upsertActivity(activities, event.data.step)
            send(event.type, event.data)
            return
          }
          if (event.type === 'turn.completed') {
            terminal = 'completed'
            completedData = event.data
            return
          }
          if (event.type === 'turn.failed') {
            terminal = 'failed'
            throw new ProviderFailure(
              event.data.error && typeof event.data.error === 'object'
                ? event.data.error as Record<string, unknown>
                : undefined,
            )
          }
        }

        while (true) {
          const part = await reader.read()
          if (part.done) break
          pending += decoder.decode(part.value, { stream: true })
          const parsed = parseProviderEvents(pending)
          pending = parsed.remainder
          for (const event of parsed.events) consume(event)
        }
        pending += decoder.decode()
        if (pending.trim()) throw new Error('truncated_provider_stream')
        if (terminal !== 'completed') throw new Error('truncated_provider_stream')

        await repository.updateAssistant(created.assistant.id, {
          content,
          reasoning: reasoning || null,
          activities,
          status: 'completed',
          errorMessage: null,
        })
        send('turn.completed', completedData)
        setRequestOutcome(request, controller.signal.aborted || request.signal.aborted ? 'cancelled' : 'success')
        logger?.info({ event: 'chat_turn_completed', conversation_id: conversation.id, turn_id: turnId, user_id: userId }, 'chat_turn_completed')
      } catch (error) {
        const cancelled = controller.signal.aborted || request.signal.aborted
        setRequestOutcome(request, cancelled ? 'cancelled' : 'error')
        const providerDetail = error instanceof ProviderFailure ? error.detail : undefined
        await repository.updateAssistant(created.assistant.id, {
          content,
          reasoning: reasoning || null,
          activities,
          status: cancelled ? 'cancelled' : 'failed',
          errorMessage: cancelled ? null : typeof providerDetail?.message === 'string'
            ? providerDetail.message : 'Unable to complete this turn.',
        })
        send('turn.failed', {
          error: {
            code: cancelled
              ? 'cancelled'
              : typeof providerDetail?.code === 'string'
                ? providerDetail.code
                : 'provider_error',
            message: cancelled
              ? 'Turn cancelled.'
              : typeof providerDetail?.message === 'string'
                ? providerDetail.message
                : 'Unable to complete this turn.',
            retryable: cancelled
              ? false
              : typeof providerDetail?.retryable === 'boolean'
                ? providerDetail.retryable
                : true,
          },
        })
        logger?.warn({ event: 'chat_turn_failed', conversation_id: conversation.id, turn_id: turnId, user_id: userId }, 'chat_turn_failed')
      } finally {
        request.signal.removeEventListener('abort', abort)
        if (controller.signal.aborted) await reader?.cancel().catch(() => undefined)
        if (targetOpen) {
          try {
            target.close()
          } catch {
            // The client already closed the response stream.
          }
        }
      }
    },
    cancel() {
      controller.abort()
    },
  })

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  })
}
