import { parseConversationSummary } from "@/features/app-shell/conversation-metadata"
import type { ConversationSummary } from "@/features/app-shell/api"
import { apiBaseUrl } from "@/lib/api"

const agentEventTypes = new Set([
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
const terminalEventTypes = new Set([
  "turn.completed",
  "turn.failed",
  "user.input_required",
])
const canonicalSequence = /^(0|[1-9]\d*)$/
const maximumSequence = 9_223_372_036_854_775_807n

type DurableRunEvent = {
  data: Record<string, unknown>
  runId: string
  sequence: bigint
  type: string
}

type SocketMessage =
  | { kind: "durable"; event: DurableRunEvent }
  | { kind: "transient"; runId: string }

type TitleSubscriptionOptions = {
  after: string
  conversationId: string
  onClosed?: () => void
  onConversationTitle: (conversation: ConversationSummary) => void
  onResync: () => void
  runId: string
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function parseEventSequence(value: unknown) {
  if (typeof value !== "string" || !canonicalSequence.test(value)) {
    throw new Error("The live conversation update was invalid.")
  }

  const sequence = BigInt(value)
  if (sequence > maximumSequence) {
    throw new Error("The live conversation update was invalid.")
  }
  return sequence
}

export function parseRunSocketMessage(value: unknown): SocketMessage {
  if (typeof value !== "string") {
    throw new Error("The live conversation update was invalid.")
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error("The live conversation update was invalid.")
  }

  const message = record(parsed)
  const data = record(message?.data)
  if (
    message?.version === 2 &&
    message.type === "browser.frame" &&
    typeof message.run_id === "string" &&
    data
  ) {
    return { kind: "transient", runId: message.run_id }
  }

  if (
    message?.version !== 2 ||
    typeof message.run_id !== "string" ||
    typeof message.turn_id !== "string" ||
    typeof message.type !== "string" ||
    !agentEventTypes.has(message.type) ||
    !data
  ) {
    throw new Error("The live conversation update was invalid.")
  }

  return {
    kind: "durable",
    event: {
      data,
      runId: message.run_id,
      sequence: parseEventSequence(message.sequence),
      type: message.type,
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

export function subscribeToConversationTitle({
  after,
  conversationId,
  onClosed,
  onConversationTitle,
  onResync,
  runId,
}: TitleSubscriptionOptions) {
  let cursor = parseEventSequence(after)
  let reconnectAttempt = 0
  let reconnectTimer: number | null = null
  let socket: WebSocket | null = null
  let stopped = false

  const stop = () => {
    if (stopped) return
    stopped = true

    if (reconnectTimer !== null) {
      window.clearTimeout(reconnectTimer)
      reconnectTimer = null
    }

    const currentSocket = socket
    socket = null
    if (currentSocket && currentSocket.readyState < WebSocket.CLOSING) {
      currentSocket.close(1000, "Title subscription complete")
    }
    onClosed?.()
  }

  const resync = () => {
    stop()
    onResync()
  }

  const scheduleReconnect = () => {
    if (stopped || reconnectTimer !== null) return
    const delay = Math.min(1_000 * 2 ** reconnectAttempt, 10_000)
    reconnectAttempt += 1
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null
      open()
    }, delay)
  }

  const open = () => {
    if (stopped) return

    let nextSocket: WebSocket
    try {
      nextSocket = new WebSocket(agentRunSocketUrl(runId, cursor.toString()))
    } catch {
      scheduleReconnect()
      return
    }

    socket = nextSocket
    nextSocket.onmessage = (message) => {
      if (stopped || socket !== nextSocket) return

      try {
        const parsed = parseRunSocketMessage(message.data)
        const messageRunId =
          parsed.kind === "durable" ? parsed.event.runId : parsed.runId
        if (messageRunId !== runId) {
          throw new Error("The live conversation update was invalid.")
        }

        reconnectAttempt = 0
        if (parsed.kind === "transient") return

        const event = parsed.event
        if (event.sequence <= cursor) return
        cursor = event.sequence

        if (event.type === "conversation.title.updated") {
          const conversation = parseConversationSummary(event.data.conversation)
          if (!conversation || conversation.id !== conversationId) {
            throw new Error("The live conversation update was invalid.")
          }
          onConversationTitle(conversation)
          stop()
          return
        }

        if (terminalEventTypes.has(event.type)) stop()
      } catch {
        resync()
      }
    }
    nextSocket.onerror = () => nextSocket.close()
    nextSocket.onclose = () => {
      if (socket === nextSocket) socket = null
      if (!stopped) scheduleReconnect()
    }
  }

  open()
  return stop
}
