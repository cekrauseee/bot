import { apiBaseUrl } from "@/lib/api"
import type { TurnStreamEvent } from "@/features/composer/api"

const eventTypes = new Set([
  "turn.started",
  "reasoning.delta",
  "text.delta",
  "step.started",
  "step.updated",
  "step.completed",
  "plan.updated",
  "conversation.title.updated",
  "user.input_required",
  "tool.started",
  "tool.updated",
  "tool.completed",
  "child.started",
  "child.completed",
  "turn.completed",
  "turn.failed",
])
const terminalTypes = new Set([
  "turn.completed",
  "turn.failed",
  "user.input_required",
])
const sequencePattern = /^(0|[1-9]\d*)$/
const maximumSequence = 9_223_372_036_854_775_807n

export type ActiveRun = {
  id: string
  conversation_id: string
  turn_id?: string
  last_event_sequence?: string | null
}

export type RunSubscriptionMessage =
  | { kind: "event"; event: TurnStreamEvent & { sequence: string } }
  | { kind: "transient"; runId: string }

export function parseEventSequence(value: unknown): bigint {
  if (typeof value !== "string" || !sequencePattern.test(value))
    throw new Error("Invalid run event.")
  const result = BigInt(value)
  if (result > maximumSequence) throw new Error("Invalid run event.")
  return result
}

const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null

export function parseRunSocketMessage(value: unknown): RunSubscriptionMessage {
  if (typeof value !== "string") throw new Error("Invalid run event.")
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error("Invalid run event.")
  }
  const message = object(parsed)
  const data = object(message?.data)
  if (message?.version !== 2 || typeof message.run_id !== "string" || !data)
    throw new Error("Invalid run event.")
  if (message.type === "browser.frame")
    return { kind: "transient", runId: message.run_id }
  if (
    typeof message.turn_id !== "string" ||
    typeof message.type !== "string" ||
    !eventTypes.has(message.type)
  )
    throw new Error("Invalid run event.")
  return {
    kind: "event",
    event: {
      data,
      run_id: message.run_id,
      sequence: String(parseEventSequence(message.sequence)),
      turn_id: message.turn_id,
      type: message.type,
      version: 2,
    },
  }
}

export function agentRunSocketUrl(
  runId: string,
  after: string,
  origin = window.location.origin
) {
  parseEventSequence(after)
  const url = new URL(apiBaseUrl || origin, origin)
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
  url.pathname = `${url.pathname.replace(/\/$/, "")}/agent-runs/${encodeURIComponent(runId)}/subscribe`
  url.search = new URLSearchParams({ after }).toString()
  return url.toString()
}

type SubscriptionOptions = {
  after: string
  runId: string
  turnId?: string
  onEvent: (event: TurnStreamEvent) => void
  onTerminal?: (event: TurnStreamEvent) => void
  onResync: () => void
}

export function subscribeToRun({
  after,
  runId,
  turnId,
  onEvent,
  onTerminal,
  onResync,
}: SubscriptionOptions) {
  let cursor = parseEventSequence(after)
  let expectedTurn = turnId
  let socket: WebSocket | null = null
  let timer: number | null = null
  let attempt = 0
  let stopped = false
  const stop = () => {
    if (stopped) return
    stopped = true
    if (timer !== null) window.clearTimeout(timer)
    timer = null
    const current = socket
    socket = null
    if (current && current.readyState < WebSocket.CLOSING)
      current.close(1000, "Run subscription complete")
  }
  const resync = () => {
    stop()
    onResync()
  }
  const reconnect = () => {
    if (stopped || timer !== null) return
    timer = window.setTimeout(
      () => {
        timer = null
        open()
      },
      Math.min(1000 * 2 ** attempt++, 10000)
    )
  }
  const open = () => {
    if (stopped) return
    let next: WebSocket
    try {
      next = new WebSocket(agentRunSocketUrl(runId, cursor.toString()))
    } catch {
      reconnect()
      return
    }
    socket = next
    next.onmessage = (message) => {
      if (stopped || socket !== next) return
      try {
        const parsed = parseRunSocketMessage(message.data)
        if (
          (parsed.kind === "event" ? parsed.event.run_id : parsed.runId) !==
          runId
        )
          throw new Error("Invalid run event.")
        attempt = 0
        if (parsed.kind === "transient") return
        const event = parsed.event
        if (event.sequence && BigInt(event.sequence) <= cursor) return
        if (expectedTurn && event.turn_id !== expectedTurn)
          throw new Error("Invalid run event.")
        expectedTurn ??= event.turn_id
        cursor = BigInt(event.sequence)
        onEvent(event)
        if (terminalTypes.has(event.type)) {
          onTerminal?.(event)
          stop()
        }
      } catch {
        resync()
      }
    }
    next.onerror = () => next.close()
    next.onclose = () => {
      if (socket === next) socket = null
      reconnect()
    }
  }
  open()
  return stop
}

export function parseActiveRun(value: unknown): ActiveRun | null {
  if (value === null || value === undefined) return null
  const run = object(value)
  if (
    !run ||
    typeof run.id !== "string" ||
    typeof run.conversation_id !== "string"
  )
    throw new Error("Invalid active run.")
  if (run.turn_id !== undefined && typeof run.turn_id !== "string")
    throw new Error("Invalid active run.")
  if (
    run.last_event_sequence !== null &&
    run.last_event_sequence !== undefined
  ) {
    parseEventSequence(run.last_event_sequence)
  }
  return {
    id: run.id,
    conversation_id: run.conversation_id,
    ...(typeof run.turn_id === "string" ? { turn_id: run.turn_id } : {}),
    ...(run.last_event_sequence !== undefined
      ? { last_event_sequence: run.last_event_sequence as string | null }
      : {}),
  }
}
