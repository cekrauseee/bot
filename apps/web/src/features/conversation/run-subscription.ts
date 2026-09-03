import { apiBaseUrl } from "@/lib/api"
import type { TurnStreamEvent } from "@/features/composer/api"
import {
  type BrowserFrame,
  type BrowserProjection,
} from "@/features/conversation/model"

const eventTypes = new Set([
  "turn.started",
  "reasoning.delta",
  "text.delta",
  "step.started",
  "step.updated",
  "step.completed",
  "plan.updated",
  "conversation.title.updated",
  "tool.started",
  "tool.updated",
  "tool.completed",
  "child.started",
  "child.completed",
  "turn.completed",
  "turn.failed",
])
const terminalTypes = new Set(["turn.completed", "turn.failed"])
const sequencePattern = /^(0|[1-9]\d*)$/
const maximumSequence = 9_223_372_036_854_775_807n

export type ActiveRun = {
  id: string
  conversation_id: string
  turn_id?: string
  last_event_sequence?: string | null
  browserProjection?: BrowserProjection | null
}

export type RunSubscriptionMessage =
  | { kind: "event"; event: TurnStreamEvent & { sequence: string } }
  | { kind: "transient"; frame: BrowserFrame; runId: string }

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

export function parseBrowserFrame(value: unknown): BrowserFrame | null {
  const frame = object(value)
  if (
    !frame ||
    typeof frame.base64 !== "string" ||
    frame.base64.length === 0 ||
    frame.base64.length > 2_000_000
  )
    return null
  if (frame.mime_type !== "image/png" && frame.mime_type !== "image/jpeg")
    return null
  if (
    typeof frame.captured_at !== "string" ||
    frame.captured_at.length === 0 ||
    frame.captured_at.length > 100
  )
    return null
  return {
    base64: frame.base64,
    mimeType: frame.mime_type,
    capturedAt: frame.captured_at,
  }
}

export function parseBrowserProjection(
  value: unknown
): BrowserProjection | null {
  const projection = object(value)
  if (
    !projection ||
    !["launching", "live", "awaiting_user", "stopped", "failed"].includes(
      String(projection.state)
    )
  )
    return null
  if (!["agent", "user", "locked"].includes(String(projection.control)))
    return null
  return {
    state: projection.state as BrowserProjection["state"],
    control: projection.control as BrowserProjection["control"],
    ...(typeof projection.url === "string" ? { url: projection.url } : {}),
    ...(typeof projection.message === "string"
      ? { message: projection.message }
      : {}),
    ...(projection.leaseExpiresAt === null ||
    typeof projection.leaseExpiresAt === "string"
      ? { leaseExpiresAt: projection.leaseExpiresAt }
      : {}),
  }
}

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
  if (message.type === "browser.frame") {
    const frame = parseBrowserFrame(data)
    if (!frame) throw new Error("Invalid browser frame.")
    return { kind: "transient", frame, runId: message.run_id }
  }
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
  onFrame?: (frame: BrowserFrame, runId: string) => void
  onTerminal?: (event: TurnStreamEvent) => void
  onResync: () => void
}

export function subscribeToRun({
  after,
  runId,
  turnId,
  onEvent,
  onFrame,
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
        if (parsed.kind === "transient") {
          onFrame?.(parsed.frame, parsed.runId)
          return
        }
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
    ...(run.browser_projection !== undefined
      ? {
          browserProjection:
            run.browser_projection === null
              ? null
              : (parseBrowserProjection(run.browser_projection) ??
                (() => {
                  throw new Error("Invalid active browser projection.")
                })()),
        }
      : {}),
  }
}
