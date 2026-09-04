import type { TurnStreamEvent } from "@/features/composer/api"
import { parseBrowserProjection } from "@/features/conversation/run-subscription"
import type {
  ConversationMessageData,
  BrowserFrame,
  BrowserProjection,
  ProcessActivity,
  ProcessActivityStatus,
  ProcessSearchSource,
} from "@/features/conversation/model"

export type ConversationRecord = {
  activeAssistantId?: string
  error: string
  messages: ConversationMessageData[]
  processStartedAt?: number
  runId?: string
  stopRequested?: boolean
  turnId?: string
  lastEventSequence?: string
  status: "error" | "idle" | "loading" | "ready"
  turnSpacerAnchorId?: string
  version: number
  browserFrame?: BrowserFrame
  browserProjection?: BrowserProjection | null
}

export const emptyConversationRecord = (): ConversationRecord => ({
  error: "",
  messages: [],
  status: "idle",
  version: 0,
})

export function applyBrowserFrame(
  current: ConversationRecord,
  frame: BrowserFrame,
  runId: string
) {
  if (!current.runId || current.runId !== runId) return current
  return { ...current, browserFrame: frame, version: current.version + 1 }
}

export function consumeTurnSpacerAnchor(
  current: ConversationRecord,
  anchorId: string
) {
  if (current.turnSpacerAnchorId !== anchorId) return current
  return { ...current, turnSpacerAnchorId: undefined }
}

export function markRunStopRequested(
  current: ConversationRecord,
  runId: string,
  requested: boolean,
  at = Date.now()
): ConversationRecord {
  if (current.runId !== runId || Boolean(current.stopRequested) === requested) {
    return current
  }
  const messages = requested
    ? current.messages.flatMap((message) => {
        if (message.id !== current.activeAssistantId) return [message]
        const activities = message.process?.activities ?? []
        if (!message.content.trim() && activities.length === 0) return []
        return [
          {
            ...message,
            process: message.process
              ? {
                  ...message.process,
                  durationSeconds:
                    current.processStartedAt === undefined
                      ? message.process.durationSeconds
                      : Math.max(
                          1,
                          Math.round((at - current.processStartedAt) / 1000)
                        ),
                  status: "processed" as const,
                }
              : undefined,
          },
        ]
      })
    : current.messages
  return {
    ...current,
    activeAssistantId: requested ? undefined : current.activeAssistantId,
    messages,
    processStartedAt: requested ? undefined : current.processStartedAt,
    stopRequested: requested ? true : undefined,
    version: current.version + 1,
  }
}

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null

const string = (value: unknown) =>
  typeof value === "string" ? value : undefined

const activityStatus = (value: unknown): ProcessActivityStatus | undefined =>
  ["completed", "failed", "in_progress"].includes(String(value))
    ? (value as ProcessActivityStatus)
    : undefined

function parseSource(
  value: unknown,
  fallbackId: string
): ProcessSearchSource | null {
  const source = record(value)
  if (!source) return null

  const title = string(source.title)
  const url = string(source.url)
  if (!title && !url) return null

  return {
    id: string(source.id) ?? fallbackId,
    title: title ?? url!,
    ...(string(source.domain) ? { domain: string(source.domain) } : {}),
    ...(url ? { url } : {}),
  }
}

export function parseProcessActivity(value: unknown): ProcessActivity | null {
  const activity = record(value)
  const id = string(activity?.id)
  if (!activity || !id) return null

  if (activity.type === "text" && typeof activity.content === "string") {
    const lastSequence =
      typeof activity.lastSequence === "number" ||
      typeof activity.lastSequence === "string"
        ? activity.lastSequence
        : undefined
    return {
      id,
      type: "text",
      content: activity.content,
      ...(lastSequence !== undefined ? { lastSequence } : {}),
    }
  }

  if (activity.type === "search" && typeof activity.query === "string") {
    const results = Array.isArray(activity.results)
      ? activity.results.flatMap((source, index) => {
          const parsed = parseSource(source, `${id}-source-${index}`)
          return parsed ? [parsed] : []
        })
      : undefined
    return {
      id,
      type: "search",
      query: activity.query,
      ...(activityStatus(activity.status)
        ? { status: activityStatus(activity.status) }
        : {}),
      ...(results?.length ? { results } : {}),
      ...(typeof activity.moreCount === "number"
        ? { moreCount: activity.moreCount }
        : {}),
    }
  }

  if (activity.type === "step" && typeof activity.label === "string") {
    const status = ["active", "complete", "pending"].includes(
      String(activity.status)
    )
      ? (activity.status as "active" | "complete" | "pending")
      : undefined
    return {
      id,
      type: "step",
      label: activity.label,
      ...(string(activity.meta) ? { meta: string(activity.meta) } : {}),
      ...(status ? { status } : {}),
    }
  }

  if (activity.type === "tool") {
    return {
      id,
      type: "tool",
      action: string(activity.action) ?? string(activity.name) ?? "tool",
      ...(string(activity.label) ? { label: string(activity.label) } : {}),
      ...(string(activity.target) ? { target: string(activity.target) } : {}),
      ...(string(activity.detail) ? { detail: string(activity.detail) } : {}),
      ...(activityStatus(activity.status)
        ? { status: activityStatus(activity.status) }
        : {}),
      ...(typeof activity.additions === "number"
        ? { additions: activity.additions }
        : {}),
      ...(typeof activity.deletions === "number"
        ? { deletions: activity.deletions }
        : {}),
    }
  }

  if (activity.type === "skill" && typeof activity.name === "string") {
    return {
      id,
      type: "skill",
      name: activity.name,
      ...(string(activity.detail) ? { detail: string(activity.detail) } : {}),
      ...(activityStatus(activity.status)
        ? { status: activityStatus(activity.status) }
        : {}),
    }
  }

  if (activity.type === "trace") {
    return {
      id,
      type: "trace",
      kind: string(activity.kind) ?? "message",
      label: string(activity.label) ?? "Activity",
      ...(string(activity.detail) ? { detail: string(activity.detail) } : {}),
      ...(activityStatus(activity.status)
        ? { status: activityStatus(activity.status) }
        : {}),
    }
  }

  const eventType = string(activity.event_type)
  if (eventType?.startsWith("skill.")) {
    return {
      id,
      type: "skill",
      name: string(activity.name) ?? string(activity.label) ?? "a skill",
      ...(string(activity.detail) ? { detail: string(activity.detail) } : {}),
      ...(activityStatus(activity.status)
        ? { status: activityStatus(activity.status) }
        : {
            status: eventType === "skill.started" ? "in_progress" : "completed",
          }),
    }
  }
  if (eventType?.startsWith("tool.")) {
    return {
      id,
      type: "tool",
      action: string(activity.name) ?? "tool",
      ...(string(activity.label) ? { label: string(activity.label) } : {}),
      ...(string(activity.target) ? { target: string(activity.target) } : {}),
      ...(string(activity.detail) ? { detail: string(activity.detail) } : {}),
      ...(activityStatus(activity.status)
        ? { status: activityStatus(activity.status) }
        : {}),
    }
  }
  if (eventType?.startsWith("child.")) {
    return {
      id,
      type: "trace",
      kind: "child",
      label: string(activity.label) ?? "Delegated a task",
      ...(string(activity.detail) ? { detail: string(activity.detail) } : {}),
      ...(activityStatus(activity.status)
        ? { status: activityStatus(activity.status) }
        : {}),
    }
  }

  return null
}

function processDuration(createdAt: string, updatedAt: string) {
  const started = Date.parse(createdAt)
  const completed = Date.parse(updatedAt)
  if (!Number.isFinite(started) || !Number.isFinite(completed)) return 1
  return Math.max(1, Math.round((completed - started) / 1000))
}

export function mapApiMessage(value: unknown): ConversationMessageData | null {
  const message = record(value)
  const id = string(message?.id)
  const role = message?.role
  const createdAt = string(message?.created_at)
  const updatedAt = string(message?.updated_at)
  if (
    !message ||
    !id ||
    (role !== "assistant" && role !== "user") ||
    !createdAt ||
    !updatedAt
  ) {
    return null
  }

  const content = string(message.content) ?? ""
  const activities = Array.isArray(message.activities)
    ? message.activities.flatMap((activity) => {
        const parsed = parseProcessActivity(activity)
        return parsed ? [parsed] : []
      })
    : []
  const hasReasoningActivity = activities.some(
    (activity) => activity.type === "text"
  )
  const reasoning = string(message.reasoning)
  if (reasoning && !hasReasoningActivity) {
    activities.unshift({
      id: `${id}-reasoning`,
      type: "text",
      content: reasoning,
    })
  }

  const streaming = message.status === "streaming"
  const errorMessage = string(message.error_message)
  const renderedContent =
    content || (message.status === "failed" ? (errorMessage ?? "") : "")
  if (
    role === "assistant" &&
    message.status === "cancelled" &&
    !renderedContent &&
    activities.length === 0
  ) {
    return null
  }
  const showProcess = role === "assistant"

  return {
    id,
    role,
    content: renderedContent,
    createdAt,
    ...(showProcess
      ? {
          process: {
            activities,
            durationSeconds: processDuration(createdAt, updatedAt),
            startedAt: Date.parse(createdAt),
            status: streaming && !content ? "processing" : "processed",
          },
        }
      : {}),
  }
}

export function recordFromDetail(
  messages: unknown[],
  activeRun?: {
    id: string
    turn_id?: string
    last_event_sequence?: string | null
    browserProjection?: BrowserProjection | null
  }
): ConversationRecord {
  let activeAssistantId: string | undefined
  const mapped = messages.flatMap((message) => {
    const parsed = mapApiMessage(message)
    const raw = record(message)
    if (parsed?.role === "assistant" && raw?.status === "streaming") {
      activeAssistantId = parsed.id
    }
    return parsed ? [parsed] : []
  })
  const activeAssistant = mapped.find(
    (message) => message.id === activeAssistantId
  )

  return {
    activeAssistantId,
    error: "",
    messages: mapped,
    processStartedAt: activeAssistant?.process?.startedAt,
    ...(activeRun
      ? {
          runId: activeRun.id,
          turnId: activeRun.turn_id,
          lastEventSequence: activeRun.last_event_sequence ?? undefined,
          browserProjection: activeRun.browserProjection ?? undefined,
        }
      : {}),
    status: "ready",
    version: 0,
  }
}

function upsertMessages(
  current: ConversationMessageData[],
  incoming: ConversationMessageData[]
) {
  const next = [...current]
  for (const message of incoming) {
    const index = next.findIndex((entry) => entry.id === message.id)
    if (index === -1) next.push(message)
    else next[index] = message
  }
  return next
}

function updateAssistant(
  record: ConversationRecord,
  update: (message: ConversationMessageData) => ConversationMessageData
) {
  const assistantId =
    record.activeAssistantId ??
    (record.runId
      ? [...record.messages]
          .reverse()
          .find((message) => message.role === "assistant")?.id
      : undefined)
  if (!assistantId) return record
  return {
    ...record,
    messages: record.messages.map((message) =>
      message.id === assistantId ? update(message) : message
    ),
  }
}

function elapsed(record: ConversationRecord, at: number) {
  return record.processStartedAt
    ? Math.max(1, Math.round((at - record.processStartedAt) / 1000))
    : 1
}

function upsertActivity(
  activities: readonly ProcessActivity[],
  activity: ProcessActivity
) {
  const index = activities.findIndex((entry) => entry.id === activity.id)
  if (index === -1) return [...activities, activity]
  return activities.map((entry, entryIndex) =>
    entryIndex === index ? mergeActivity(entry, activity) : entry
  )
}

function mergeActivity(
  current: ProcessActivity,
  next: ProcessActivity
): ProcessActivity {
  if (current.type === "step" && next.type === "step") {
    return { ...current, ...next }
  }
  if (current.type === "text" && next.type === "text") {
    return { ...current, ...next }
  }
  if (current.type === "search" && next.type === "search") {
    return { ...current, ...next }
  }
  if (current.type === "tool" && next.type === "tool") {
    return { ...current, ...next }
  }
  if (current.type === "skill" && next.type === "skill") {
    return { ...current, ...next }
  }
  if (current.type === "trace" && next.type === "trace") {
    return { ...current, ...next }
  }
  return next
}

function eventActivity(event: TurnStreamEvent): ProcessActivity | null {
  const key = event.type.startsWith("step.")
    ? "step"
    : event.type.startsWith("tool.")
      ? "tool"
      : event.type.startsWith("skill.")
        ? "skill"
        : event.type.startsWith("child.")
          ? "child"
          : null
  const raw = key ? record(event.data[key]) : null
  const id = string(raw?.id)
  if (!raw || !id) return null

  if (key === "step" && raw.kind === "web_search") {
    const results = Array.isArray(raw.sources)
      ? raw.sources.flatMap((source, index) => {
          const parsed = parseSource(source, `${id}-source-${index}`)
          return parsed ? [parsed] : []
        })
      : undefined
    return {
      id,
      type: "search",
      query: string(raw.query) ?? string(raw.label) ?? "Web search",
      ...(activityStatus(raw.status)
        ? { status: activityStatus(raw.status) }
        : {}),
      ...(results?.length ? { results } : {}),
    }
  }
  if (key === "tool") {
    return {
      id,
      type: "tool",
      action: string(raw.name) ?? "tool",
      ...(string(raw.label) ? { label: string(raw.label) } : {}),
      ...(string(raw.target) ? { target: string(raw.target) } : {}),
      ...(string(raw.detail) ? { detail: string(raw.detail) } : {}),
      ...(activityStatus(raw.status)
        ? { status: activityStatus(raw.status) }
        : {}),
    }
  }
  if (key === "skill") {
    return {
      id,
      type: "skill",
      name: string(raw.name) ?? string(raw.label) ?? "a skill",
      ...(string(raw.detail) ? { detail: string(raw.detail) } : {}),
      ...(activityStatus(raw.status)
        ? { status: activityStatus(raw.status) }
        : {
            status:
              event.type === "skill.started" ? "in_progress" : "completed",
          }),
    }
  }
  if (key === "child") {
    return {
      id,
      type: "trace",
      kind: "child",
      label: string(raw.label) ?? "a task",
      ...(string(raw.detail) ? { detail: string(raw.detail) } : {}),
      ...(activityStatus(raw.status)
        ? { status: activityStatus(raw.status) }
        : {}),
    }
  }
  return null
}

export function applyTurnEvent(
  current: ConversationRecord,
  event: TurnStreamEvent,
  at: number
): ConversationRecord {
  try {
    if (
      current.lastEventSequence !== undefined &&
      BigInt(event.sequence) <= BigInt(current.lastEventSequence)
    ) {
      return current
    }
  } catch {
    return current
  }
  let next: ConversationRecord = {
    ...current,
    error: "",
    status: "ready",
  }
  if (event.type === "turn.started") {
    const user = mapApiMessage(event.data.user_message)
    const assistant = mapApiMessage(event.data.assistant_message)
    if (!user || !assistant) return next
    const startedAt = Date.parse(assistant.createdAt ?? "")
    const processStartedAt = Number.isFinite(startedAt) ? startedAt : at
    assistant.process = {
      activities: assistant.process?.activities ?? [],
      durationSeconds: 1,
      startedAt: processStartedAt,
      status: "processing",
    }
    return {
      ...next,
      activeAssistantId: assistant.id,
      messages: upsertMessages(next.messages, [user, assistant]),
      processStartedAt,
      runId: event.run_id,
      turnId: event.turn_id,
      lastEventSequence: event.sequence,
      turnSpacerAnchorId: user.id,
      version: next.version + 1,
    }
  }

  if (
    next.runId &&
    (next.runId !== event.run_id ||
      (next.turnId && next.turnId !== event.turn_id))
  )
    return next

  const terminalEvent =
    event.type === "turn.completed" || event.type === "turn.failed"
  if (next.stopRequested && !terminalEvent) {
    return {
      ...next,
      lastEventSequence: event.sequence,
      version: next.version + 1,
    }
  }

  if (event.type === "reasoning.delta") {
    const delta = string(event.data.delta)
    if (!delta) return next
    next = updateAssistant(next, (assistant) => {
      const process = assistant.process ?? {
        activities: [],
        durationSeconds: elapsed(next, at),
        startedAt: next.processStartedAt,
        status: "processing" as const,
      }
      const activities = [...process.activities]
      const last = activities.at(-1)
      if (
        last?.type === "text" &&
        last.lastSequence !== undefined &&
        BigInt(last.lastSequence) + 1n === BigInt(event.sequence)
      ) {
        activities[activities.length - 1] = {
          ...last,
          content: last.content + delta,
          lastSequence: event.sequence,
        }
      } else {
        activities.push({
          id: `${assistant.id}-reasoning-${event.sequence}`,
          type: "text",
          content: delta,
          lastSequence: event.sequence,
        })
      }
      return {
        ...assistant,
        process: {
          ...process,
          activities,
          durationSeconds: elapsed(next, at),
          status: "processing",
        },
      }
    })
  } else if (
    event.type.startsWith("step.") ||
    event.type.startsWith("tool.") ||
    event.type.startsWith("skill.") ||
    event.type.startsWith("child.")
  ) {
    const activity = eventActivity(event)
    if (activity) {
      next = updateAssistant(next, (assistant) => {
        const process = assistant.process ?? {
          activities: [],
          durationSeconds: elapsed(next, at),
          startedAt: next.processStartedAt,
          status: "processing" as const,
        }
        return {
          ...assistant,
          process: {
            ...process,
            activities: upsertActivity(process.activities, activity),
            durationSeconds: elapsed(next, at),
            status: "processing",
          },
        }
      })
      const rawProjection =
        record(event.data.browser_projection) ?? record(event.data.browser)
      if (rawProjection) {
        const projection = parseBrowserProjection(rawProjection)
        if (projection) {
          next.browserProjection = projection
          if (projection.state === "stopped" || projection.state === "failed") {
            next.browserFrame = undefined
          }
        }
      }
    }
  } else if (event.type === "text.delta") {
    const delta = string(event.data.delta)
    if (delta) {
      next = updateAssistant(next, (assistant) => ({
        ...assistant,
        content: assistant.content + delta,
        process: assistant.process
          ? {
              ...assistant.process,
              durationSeconds: elapsed(next, at),
              status: "processed",
            }
          : undefined,
      }))
    }
  } else if (event.type === "turn.completed" || event.type === "turn.failed") {
    next = updateAssistant(next, (assistant) => {
      const error = record(event.data.error)
      const errorMessage = string(error?.message)
      return {
        ...assistant,
        content:
          event.type === "turn.failed" && !assistant.content
            ? (errorMessage ?? "Unable to complete this response.")
            : assistant.content,
        process: assistant.process
          ? {
              ...assistant.process,
              durationSeconds: elapsed(next, at),
              status: "processed",
            }
          : undefined,
      }
    })
    next = {
      ...next,
      activeAssistantId: undefined,
      browserFrame: undefined,
      browserProjection: undefined,
      processStartedAt: undefined,
      runId: undefined,
      stopRequested: undefined,
      turnId: undefined,
      lastEventSequence: undefined,
    }
  }

  return {
    ...next,
    lastEventSequence: event.sequence,
    version: next.version + 1,
  }
}
