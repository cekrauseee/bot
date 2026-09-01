import { randomUUID } from 'node:crypto'
import type { Redis } from 'ioredis'
import type { Database } from '../db/database.js'
import type { AgentEvent, AgentRun } from '../db/repository.js'
import { AgentRunLeaseLostError, AgentRunRepository } from '../db/repository.js'
import { createLogger, safeError } from '../logger.js'
import type { AiClient } from './conversations.js'

const logger = createLogger({ environment: process.env.ENVIRONMENT === 'production' ? 'production' : 'development' })
export const aiDiagnostic = (value: unknown) => {
  const record = plainRecord(value)
  const code = typeof record?.error_code === 'string' ? record.error_code : record?.code
  if (code === 'insufficient_quota') {
    return { error_category: 'provider_quota', error_code: code,
      error_summary: 'The AI provider quota is exhausted.', retryable: false }
  }
  if (code === 'provider_rate_limit' || code === 'rate_limited') {
    return { error_category: 'provider_rate_limit', error_code: code,
      error_summary: 'The AI provider rate limit was reached.', retryable: true }
  }
  if (code === 'provider_auth') {
    return { error_category: 'provider_auth', error_code: code,
      error_summary: 'The AI provider rejected the credentials.', retryable: false }
  }
  if (code === 'provider_permission') {
    return { error_category: 'provider_permission', error_code: code,
      error_summary: 'The AI provider denied access to this model.', retryable: false }
  }
  if (code === 'provider_bad_request') {
    return { error_category: 'provider_bad_request', error_code: code,
      error_summary: 'The AI provider rejected the request.', retryable: false }
  }
  if (code === 'provider_timeout') {
    return { error_category: 'provider_timeout', error_code: code,
      error_summary: 'The AI provider timed out.', retryable: true }
  }
  if (code === 'provider_unavailable') {
    return { error_category: 'provider_unavailable', error_code: code,
      error_summary: 'The AI provider is temporarily unavailable.', retryable: true }
  }
  if (code === 'provider_missing') {
    return { error_category: 'provider_missing', error_code: code,
      error_summary: 'The selected AI provider is not configured.', retryable: false }
  }
  if (code === 'internal_error') {
    return { error_category: 'internal', error_code: code,
      error_summary: 'The AI service encountered an internal error.', retryable: false }
  }
  if (code === 'invalid_provider_event') {
    return { error_category: 'provider_protocol', error_code: code,
      error_summary: 'The AI provider stream was invalid.', retryable: true }
  }
  return {
    error_category: 'provider',
    error_code: 'provider_error',
    error_summary: 'The provider operation failed.',
    retryable: true,
  }
}

export const agentEventTypes = [
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

export type AgentEventType = (typeof agentEventTypes)[number]
type ProviderEventType = AgentEventType | 'browser.frame'

type ProviderEvent = {
  version: 2
  sequence: number
  run_id: string
  turn_id: string
  type: ProviderEventType
  data: Record<string, unknown>
}

export type PublicAgentEvent = {
  version: 2
  sequence: string
  run_id: string
  turn_id: string
  type: AgentEventType
  data: Record<string, unknown>
}

const eventTypes = new Set<string>(agentEventTypes)
const providerEventTypes = new Set<string>([...agentEventTypes, 'browser.frame'])
const terminalTypes = new Set<AgentEventType>(['turn.completed', 'turn.failed', 'user.input_required'])

function validBrowserFrame(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const frame = value as Record<string, unknown>
  return typeof frame.base64 === 'string' && frame.base64.length > 0 &&
    frame.base64.length <= 2_000_000 &&
    (frame.mime_type === 'image/png' || frame.mime_type === 'image/jpeg') &&
    typeof frame.captured_at === 'string' && frame.captured_at.length > 0 &&
    frame.captured_at.length <= 100
}

const parseBlock = (block: string): ProviderEvent | undefined => {
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
    candidate.version !== 2 ||
    !Number.isInteger(candidate.sequence) ||
    typeof candidate.run_id !== 'string' ||
    typeof candidate.turn_id !== 'string' ||
    typeof candidate.type !== 'string' ||
    !providerEventTypes.has(candidate.type) ||
    !candidate.data || typeof candidate.data !== 'object' || Array.isArray(candidate.data) ||
    (eventName !== undefined && eventName !== candidate.type)
  ) throw new Error('invalid_provider_event')
  return candidate as ProviderEvent
}

export function parseAgentEvents(input: string) {
  const events: ProviderEvent[] = []
  let remainder = input
  while (true) {
    const separator = /\r?\n\r?\n/.exec(remainder)
    if (!separator || separator.index === undefined) break
    const block = remainder.slice(0, separator.index)
    remainder = remainder.slice(separator.index + separator[0].length)
    const event = parseBlock(block)
    if (event) events.push(event)
  }
  return { events, remainder }
}

export const publicAgentEvent = (event: AgentEvent): PublicAgentEvent => ({
  version: 2,
  sequence: event.sequence.toString(),
  run_id: event.runId,
  turn_id: event.turnId,
  type: event.type as AgentEventType,
  data: event.data as Record<string, unknown>,
})

type EventListener = (event: PublicAgentEvent) => void
type FrameListener = (frame: unknown) => void

export type AgentEventFanoutEnvelope =
  | { kind: 'event'; source: string; event: PublicAgentEvent }
  | { kind: 'frame'; source: string; runId: string; frame: Record<string, unknown> }

export interface AgentEventFanout {
  publish(envelope: AgentEventFanoutEnvelope): Promise<void>
  subscribe(listener: (envelope: AgentEventFanoutEnvelope) => void): () => void
}

const validFanoutEnvelope = (value: unknown): value is AgentEventFanoutEnvelope => {
  if (!value || typeof value !== 'object') return false
  const envelope = value as Record<string, unknown>
  if (typeof envelope.source !== 'string' || !envelope.source) return false
  if (envelope.kind === 'frame') {
    return typeof envelope.runId === 'string' && envelope.runId.length > 0 &&
      validBrowserFrame(envelope.frame)
  }
  if (envelope.kind !== 'event') return false
  const event = envelope.event as Partial<PublicAgentEvent> | undefined
  return event?.version === 2 && typeof event.sequence === 'string' && /^\d+$/.test(event.sequence) &&
    typeof event.run_id === 'string' && typeof event.turn_id === 'string' &&
    typeof event.type === 'string' && eventTypes.has(event.type) &&
    event.data !== null && typeof event.data === 'object' && !Array.isArray(event.data)
}

export class RedisAgentEventFanout implements AgentEventFanout {
  private readonly listeners = new Set<(envelope: AgentEventFanoutEnvelope) => void>()
  private connected = false
  private readonly onMessage = (channel: string, payload: string) => {
    if (channel !== this.channel) return
    try {
      const envelope: unknown = JSON.parse(payload)
      if (validFanoutEnvelope(envelope)) {
        for (const listener of this.listeners) listener(envelope)
      }
    } catch { /* PostgreSQL replay repairs missed or malformed projection messages. */ }
  }

  constructor(
    private readonly publisher: Redis,
    private readonly subscriber: Redis,
    private readonly channel = 'mybot:agent-events:v2',
  ) {}

  async connect() {
    if (this.connected) return
    this.subscriber.on('message', this.onMessage)
    await this.subscriber.subscribe(this.channel)
    this.connected = true
  }

  async publish(envelope: AgentEventFanoutEnvelope) {
    await this.publisher.publish(this.channel, JSON.stringify(envelope))
  }

  subscribe(listener: (envelope: AgentEventFanoutEnvelope) => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async close() {
    this.listeners.clear()
    if (this.connected) {
      await this.subscriber.unsubscribe(this.channel)
      this.subscriber.off('message', this.onMessage)
      this.connected = false
    }
    await Promise.all([this.publisher.quit(), this.subscriber.quit()])
  }
}

/** Process-local projection only. PostgreSQL remains the event source of truth. */
export class AgentEventHub {
  private readonly events = new Map<string, Set<EventListener>>()
  private readonly frames = new Map<string, Set<FrameListener>>()

  private publishTo<T>(listenersByRun: Map<string, Set<(value: T) => void>>, runId: string, value: T) {
    const listeners = listenersByRun.get(runId)
    if (!listeners) return
    for (const listener of listeners) {
      try {
        listener(value)
      } catch {
        listeners.delete(listener)
      }
    }
    if (!listeners.size) listenersByRun.delete(runId)
  }

  subscribe(runId: string, listener: EventListener) {
    const listeners = this.events.get(runId) ?? new Set<EventListener>()
    listeners.add(listener)
    this.events.set(runId, listeners)
    return () => {
      listeners.delete(listener)
      if (!listeners.size) this.events.delete(runId)
    }
  }

  publish(event: PublicAgentEvent) {
    this.publishTo(this.events, event.run_id, event)
  }

  subscribeFrames(runId: string, listener: FrameListener) {
    const listeners = this.frames.get(runId) ?? new Set<FrameListener>()
    listeners.add(listener)
    this.frames.set(runId, listeners)
    return () => {
      listeners.delete(listener)
      if (!listeners.size) this.frames.delete(runId)
    }
  }

  /** Runtime providers may project ephemeral browser frames here later. */
  publishBrowserFrame(runId: string, frame: unknown) {
    this.publishTo(this.frames, runId, frame)
  }
}

const plainRecord = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined

const itemId = (data: Record<string, unknown>) => {
  const item = plainRecord(data.step) ?? plainRecord(data.tool) ?? plainRecord(data.child)
  return typeof item?.id === 'string' ? item.id : undefined
}

const upsertActivity = (
  activities: Array<Record<string, unknown>>,
  type: AgentEventType,
  data: Record<string, unknown>,
) => {
  if (!type.startsWith('step.') && !type.startsWith('tool.') && !type.startsWith('child.')) return
  const raw = plainRecord(data.step) ?? plainRecord(data.tool) ?? plainRecord(data.child)
  const id = itemId(data)
  if (!raw || !id) return
  let next: Record<string, unknown>
  if (plainRecord(data.step)?.kind === 'web_search') {
    const sources = Array.isArray(raw.sources) ? raw.sources.flatMap((source) => {
      const item = plainRecord(source)
      if (!item) return []
      const rawUrl = typeof item.url === 'string' ? item.url : undefined
      let domain = typeof item.domain === 'string' ? item.domain : undefined
      if (rawUrl && !domain) {
        try { domain = new URL(rawUrl).hostname } catch { /* omit invalid source URLs */ }
      }
      const title = typeof item.title === 'string' ? item.title : rawUrl
      return title ? [{
        ...(typeof item.id === 'string' ? { id: item.id } : {}),
        title,
        ...(domain ? { domain } : {}),
        ...(rawUrl ? { url: rawUrl } : {}),
      }] : []
    }) : []
    next = {
      id,
      type: 'search',
      query: typeof raw.query === 'string'
        ? raw.query
        : typeof raw.label === 'string' ? raw.label : 'Web search',
      ...(sources.length ? { results: sources } : {}),
    }
  } else {
    next = { ...raw, event_type: type }
  }
  const index = activities.findIndex((activity) => activity.id === id)
  if (index === -1) activities.push(next)
  else activities[index] = next
}

const appendReasoningActivity = (
  activities: Array<Record<string, unknown>>,
  delta: string,
  sequence: number,
) => {
  const last = activities.at(-1)
  if (last?.type === 'text' && last.lastSequence === sequence - 1 &&
    typeof last.content === 'string') {
    last.content += delta
    last.lastSequence = sequence
    return
  }
  activities.push({
    id: `reasoning-${sequence}`,
    type: 'text',
    content: delta,
    lastSequence: sequence,
  })
}

const questionProjection = (data: Record<string, unknown>) =>
  plainRecord(data.question) ?? data

const browserProjection = (data: Record<string, unknown>) =>
  plainRecord(data.browser) ?? plainRecord(data.browser_projection)

type CheckpointProjection = {
  id: string
  phase: 'runnable' | 'interrupted' | 'completed'
  content: string
  pendingQuestion?: Record<string, unknown>
  resumeConsumed: boolean
}

const checkpointProjection = (data: Record<string, unknown>): CheckpointProjection | undefined => {
  const checkpoint = plainRecord(data.checkpoint)
  if (!checkpoint) return undefined
  const phase = checkpoint.phase
  if (
    typeof checkpoint.id !== 'string' || !checkpoint.id ||
    (phase !== 'runnable' && phase !== 'interrupted' && phase !== 'completed') ||
    typeof checkpoint.content !== 'string' ||
    typeof checkpoint.resume_consumed !== 'boolean'
  ) return undefined
  const pendingQuestion = checkpoint.pending_question === null
    ? undefined
    : plainRecord(checkpoint.pending_question)
  if (checkpoint.pending_question !== null && !pendingQuestion) return undefined
  return {
    id: checkpoint.id,
    phase,
    content: checkpoint.content,
    ...(pendingQuestion ? { pendingQuestion } : {}),
    resumeConsumed: checkpoint.resume_consumed,
  }
}

export class AgentRunExecutor {
  readonly hub: AgentEventHub
  private readonly controllers = new Map<string, AbortController>()
  private readonly executing = new Set<string>()
  private readonly rerun = new Set<string>()
  private readonly claimed = new Map<string, AgentRun>()
  private readonly requestHeaders = new Map<string, Record<string, string>>()
  private readonly source = randomUUID()
  private readonly unsubscribeFanout: () => void
  private readonly executionPromises = new Set<Promise<void>>()
  private recoveryPromise?: Promise<number>
  private recoveryTimer?: ReturnType<typeof setInterval>
  private closePromise?: Promise<void>
  private closing = false

  constructor(
    private readonly database: Database,
    private readonly ai: AiClient,
    hub = new AgentEventHub(),
    private readonly fanout?: AgentEventFanout,
  ) {
    this.hub = hub
    this.unsubscribeFanout = fanout?.subscribe((envelope) => {
      if (envelope.source === this.source) return
      if (envelope.kind === 'event') this.hub.publish(envelope.event)
      else this.hub.publishBrowserFrame(envelope.runId, envelope.frame)
    }) ?? (() => undefined)
  }

  start(runId: string, headers?: Record<string, string>) {
    if (this.closing) return
    if (headers) this.requestHeaders.set(runId, headers)
    if (this.executing.has(runId)) {
      this.rerun.add(runId)
      return
    }
    this.executing.add(runId)
    let execution: Promise<void>
    execution = Promise.resolve()
      .then(() => this.closing ? undefined : this.execute(runId))
      .catch((error) => logger.error({ event: 'agent_run_execution_failed', run_id: runId, ...safeError(error) }, 'agent_run_execution_failed'))
      .finally(() => {
        this.executionPromises.delete(execution)
        this.executing.delete(runId)
        const rerun = this.rerun.delete(runId)
        if (rerun && !this.closing) this.start(runId)
      })
    this.executionPromises.add(execution)
  }

  startClaimed(run: AgentRun, headers?: Record<string, string>) {
    if (!run.executionToken || run.status !== 'running') throw new AgentRunLeaseLostError()
    if (this.closing) return
    this.claimed.set(run.id, run)
    this.start(run.id, headers)
  }

  private async recoverRuns(limit: number) {
    const runs = await this.database.transaction((db) => new AgentRunRepository(db).recoverable(limit))
    for (const run of runs) this.start(run.id)
    return runs.length
  }

  recover(limit = 100): Promise<number> {
    if (this.closing) return Promise.resolve(0)
    if (this.recoveryPromise) return this.recoveryPromise
    const recovery = this.recoverRuns(limit)
    this.recoveryPromise = recovery
    const clear = () => {
      if (this.recoveryPromise === recovery) this.recoveryPromise = undefined
    }
    void recovery.then(clear, clear)
    return recovery
  }

  startRecoverySweeper(intervalMilliseconds = 30_000, limit = 100) {
    if (this.recoveryTimer || this.closing) return
    const sweep = () => {
      if (this.closing) return
      void this.recover(limit).catch((error) => logger.error({ event: 'agent_run_recovery_failed', ...safeError(error) }, 'agent_run_recovery_failed'))
    }
    queueMicrotask(sweep)
    this.recoveryTimer = setInterval(sweep, intervalMilliseconds)
    this.recoveryTimer.unref()
  }

  close(): Promise<void> {
    if (this.closePromise) return this.closePromise
    this.closing = true
    if (this.recoveryTimer) clearInterval(this.recoveryTimer)
    this.recoveryTimer = undefined
    this.rerun.clear()
    this.claimed.clear()
    this.requestHeaders.clear()
    for (const controller of this.controllers.values()) controller.abort()
    const recovery = this.recoveryPromise
    this.closePromise = (async () => {
      if (recovery) await Promise.allSettled([recovery])
      await Promise.allSettled(this.executionPromises)
      this.unsubscribeFanout()
    })()
    return this.closePromise
  }

  cancel(runId: string, headers?: Record<string, string>) {
    const controller = this.controllers.get(runId)
    if (controller) controller.abort()
    this.start(runId, headers)
  }

  private async dispatch(event: PublicAgentEvent) {
    this.hub.publish(event)
    if (!this.fanout) return
    try {
      await this.fanout.publish({ kind: 'event', source: this.source, event })
    } catch (error) {
      logger.error({ event: 'agent_event_fanout_failed', ...safeError(error) }, 'agent_event_fanout_failed')
    }
  }

  private async dispatchBrowserFrame(runId: string, frame: Record<string, unknown>) {
    this.hub.publishBrowserFrame(runId, frame)
    if (!this.fanout) return
    try {
      await this.fanout.publish({ kind: 'frame', source: this.source, runId, frame })
    } catch (error) {
      logger.error({ event: 'agent_browser_frame_fanout_failed', run_id: runId, ...safeError(error) }, 'agent_browser_frame_fanout_failed')
    }
  }

  async publishCommitted(event: AgentEvent) {
    await this.dispatch(publicAgentEvent(event))
  }

  private async persist(
    run: AgentRun,
    type: AgentEventType,
    data: Record<string, unknown>,
    patch: Parameters<AgentRunRepository['appendEvent']>[3] = {},
    assistantPatch?: Parameters<AgentRunRepository['setAssistant']>[1],
  ) {
    const event = await this.database.transaction(async (db) => {
      const repository = new AgentRunRepository(db)
      if (assistantPatch) await repository.setAssistant(run, assistantPatch)
      return repository.appendEvent(run, type, data, patch)
    })
    const serialized = publicAgentEvent(event)
    await this.dispatch(serialized)
    return serialized
  }

  private async finishCancelled(run: AgentRun) {
    await this.persist(run, 'turn.failed', {
      error: { code: 'cancelled', message: 'Turn cancelled.', retryable: false },
    }, {
      status: 'cancelled',
      pendingQuestion: null,
      resumeInput: null,
      leaseExpiresAt: null,
      completedAt: new Date(),
    }, {
      status: 'cancelled', errorMessage: null,
    })
  }

  private async execute(runId: string) {
    if (this.closing) return
    const headers = this.requestHeaders.get(runId)
    this.requestHeaders.delete(runId)
    const handedOff = this.claimed.get(runId)
    this.claimed.delete(runId)
    const run = await this.database.transaction(async (db) => {
      const repository = new AgentRunRepository(db)
      if (handedOff?.executionToken) {
        const renewed = await repository.renewLease(runId, handedOff.executionToken)
        if (renewed) return renewed
      }
      return await repository.claimCancellation(runId) ?? repository.claim(runId)
    })
    if (!run?.executionToken || this.closing) return

    const controller = new AbortController()
    this.controllers.set(run.id, controller)
    let leaseLost = false
    let renewing = false
    const leaseTimer = setInterval(() => {
      if (renewing) return
      renewing = true
      void this.database.transaction((db) =>
        new AgentRunRepository(db).renewLease(run.id, run.executionToken!))
        .then((renewed) => {
          if (!renewed) {
            leaseLost = true
            controller.abort()
          }
        })
        .catch(() => {
          leaseLost = true
          controller.abort()
        })
        .finally(() => { renewing = false })
    }, 30_000)
    leaseTimer.unref()
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
    try {
      if (run.cancelRequestedAt) {
        await this.finishCancelled(run)
        return
      }
      const state = await this.database.transaction(async (db) => {
        const repository = new AgentRunRepository(db)
        return {
          transcript: await repository.transcript(run),
          assistant: await repository.assistant(run),
        }
      })
      if (!state.assistant) throw new Error('assistant_missing')
      let content = state.assistant.content
      let reasoning = state.assistant.reasoning ?? ''
      const activities = Array.isArray(state.assistant.activities)
        ? [...state.assistant.activities] as Array<Record<string, unknown>>
        : []
      const resume = plainRecord(run.resumeInput)
      const response = await this.ai({
        version: 2,
        run_id: run.id,
        turn_id: run.turnId,
        workspace_id: run.workspaceId,
        working_directory: run.workingDirectory,
        conversation_id: run.conversationId,
        user_id: run.userId,
        messages: state.transcript.map(({ role, content: messageContent }) => ({
          role,
          content: messageContent,
        })),
        task_plan: Array.isArray(run.plan) ? run.plan : [],
        model: run.model,
        reasoning_effort: run.reasoningEffort,
        speed: run.speed,
        ...(resume ? { resume } : {}),
      }, controller.signal, headers)
      if (!response.ok || !response.body) throw new Error('provider_unavailable')

      reader = response.body.getReader()
      const decoder = new TextDecoder()
      let pending = ''
      let lastProviderSequence = -1
      let terminal: AgentEventType | undefined

      const consume = async (event: ProviderEvent) => {
        if (
          event.turn_id !== run.turnId ||
          event.run_id !== run.id ||
          event.sequence <= lastProviderSequence || terminal
        ) throw new Error('invalid_provider_event')
        lastProviderSequence = event.sequence
        if (event.type === 'browser.frame') {
          const frame = plainRecord(event.data.frame)
          if (!frame || !validBrowserFrame(frame)) throw new Error('invalid_provider_event')
          await this.dispatchBrowserFrame(run.id, frame)
          return
        }
        if (event.type === 'turn.started') {
          const checkpoint = checkpointProjection(event.data)
          if (!checkpoint) return
          content = checkpoint.content
          if (
            checkpoint.id === run.reconciledCheckpointId &&
            !checkpoint.resumeConsumed
          ) return
          await this.persist(run, event.type, event.data, {
            reconciledCheckpointId: checkpoint.id,
            ...(checkpoint.resumeConsumed ? { resumeInput: null } : {}),
          }, {
            content,
            reasoning: reasoning || null,
            activities,
          })
          return
        }

        const data = event.data
        if (event.type === 'text.delta') {
          if (typeof data.delta !== 'string') throw new Error('invalid_provider_event')
          content += data.delta
        } else if (event.type === 'reasoning.delta') {
          if (typeof data.delta !== 'string') throw new Error('invalid_provider_event')
          reasoning += data.delta
          appendReasoningActivity(activities, data.delta, event.sequence)
        }
        upsertActivity(activities, event.type, data)

        if (event.type === 'user.input_required') {
          terminal = event.type
          await this.persist(run, event.type, data, {
            status: 'waiting',
            pendingQuestion: questionProjection(data),
            resumeInput: null,
            leaseExpiresAt: null,
          }, { content, reasoning: reasoning || null, activities, status: 'waiting', errorMessage: null })
          return
        }
        if (event.type === 'turn.completed') {
          terminal = event.type
          await this.persist(run, event.type, data, {
            status: 'completed',
            pendingQuestion: null,
            resumeInput: null,
            leaseExpiresAt: null,
            completedAt: new Date(),
          }, { content, reasoning: reasoning || null, activities, status: 'completed', errorMessage: null })
          return
        }
        if (event.type === 'turn.failed') {
          terminal = event.type
          const detail = plainRecord(data.error)
          logger.error({ event: 'agent_run_failed', run_id: run.id, turn_id: run.turnId, ...aiDiagnostic(detail) }, 'agent_run_failed')
          await this.persist(run, event.type, {
            error: {
              code: typeof detail?.code === 'string' ? detail.code : 'provider_error',
              message: typeof detail?.message === 'string' ? detail.message : 'Unable to complete this turn.',
              retryable: typeof detail?.retryable === 'boolean' ? detail.retryable : true,
            },
          }, {
            status: 'failed',
            pendingQuestion: null,
            resumeInput: null,
            leaseExpiresAt: null,
            completedAt: new Date(),
          }, {
            content, reasoning: reasoning || null, activities, status: 'failed',
            errorMessage: 'Unable to complete this turn.',
          })
          return
        }

        const plan = event.type === 'plan.updated' && Array.isArray(data.plan) ? data.plan : undefined
        const browser = browserProjection(data)
        await this.persist(run, event.type, data, {
          ...(plan ? { plan } : {}),
          ...(browser ? { browserProjection: browser } : {}),
        }, { content, reasoning: reasoning || null, activities })
      }

      read: while (true) {
        const part = await reader.read()
        if (part.done) break
        pending += decoder.decode(part.value, { stream: true })
        const parsed = parseAgentEvents(pending)
        pending = parsed.remainder
        for (const event of parsed.events) {
          await consume(event)
          if (event.type !== 'browser.frame' && terminalTypes.has(event.type)) break read
        }
      }
      if (terminal === 'user.input_required') {
        await reader.cancel().catch(() => undefined)
        return
      }
      pending += decoder.decode()
      if (pending.trim() || !terminal) throw new Error('truncated_provider_stream')
    } catch (error) {
      if (leaseLost || error instanceof AgentRunLeaseLostError || controller.signal.aborted) return
      const diagnostic = aiDiagnostic(error)
      logger.error({ event: 'agent_run_failed', run_id: run.id, turn_id: run.turnId, ...safeError(error), ...diagnostic }, 'agent_run_failed')
      try {
        await this.persist(run, 'turn.failed', {
          error: { code: 'provider_error', message: 'Unable to complete this turn.', retryable: true },
        }, {
          status: 'failed',
          pendingQuestion: null,
          resumeInput: null,
          leaseExpiresAt: null,
          completedAt: new Date(),
        }, {
          status: 'failed', errorMessage: 'Unable to complete this turn.',
        })
      } catch (terminalError) {
        if (!(terminalError instanceof AgentRunLeaseLostError)) {
          logger.error({ event: 'agent_run_terminal_persistence_failed', run_id: run.id, turn_id: run.turnId, ...safeError(terminalError) }, 'agent_run_terminal_persistence_failed')
        }
      }
      void error
    } finally {
      clearInterval(leaseTimer)
      this.controllers.delete(run.id)
      if (controller.signal.aborted) await reader?.cancel().catch(() => undefined)
    }
  }

  stream(runId: string, afterSequence = 0n) {
    const encoder = new TextEncoder()
    const hub = this.hub
    const database = this.database
    let unsubscribe: () => void = () => undefined
    let closed = false
    let lastSequence = afterSequence
    return new Response(new ReadableStream<Uint8Array>({
      async start(target) {
        const buffered: PublicAgentEvent[] = []
        let replaying = true
        const send = (event: PublicAgentEvent) => {
          const sequence = BigInt(event.sequence)
          if (closed || sequence <= lastSequence) return
          lastSequence = sequence
          try {
            target.enqueue(encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`))
            if (terminalTypes.has(event.type)) {
              closed = true
              unsubscribe()
              target.close()
            }
          } catch {
            closed = true
            unsubscribe()
          }
        }
        const receive = (event: PublicAgentEvent) => {
          if (replaying) buffered.push(event)
          else send(event)
        }
        unsubscribe = hub.subscribe(runId, receive)
        const highWater = await database.transaction((db) =>
          new AgentRunRepository(db).replayHighWater(runId))
        while (!closed && lastSequence < highWater) {
          const page = await database.transaction((db) =>
            new AgentRunRepository(db).replayPage(runId, lastSequence, highWater))
          for (const event of page.events) send(publicAgentEvent(event))
          if (!page.hasMore) break
        }
        while (buffered.length && !closed) {
          const batch = buffered.splice(0).sort((left, right) =>
            BigInt(left.sequence) < BigInt(right.sequence) ? -1 : 1)
          for (const event of batch) send(event)
        }
        replaying = false
      },
      cancel() {
        closed = true
        unsubscribe()
      },
    }), {
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      },
    })
  }
}
