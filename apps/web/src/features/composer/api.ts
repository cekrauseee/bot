import type { ConversationSummary } from "@/features/app-shell/api"
import { parseConversationSummary } from "@/features/app-shell/conversation-metadata"
import { apiBaseUrl, apiErrorFromResponse } from "@/lib/api"

export type ConversationTurnInput = {
  message: string
  model: string
  reasoning_effort: string
  speed: "fast" | "standard"
}

export type ConversationTurnStarted = {
  after: string
  conversation: ConversationSummary
  runId: string
}

export type TurnStreamEvent = {
  data: Record<string, unknown>
  run_id: string
  sequence: string
  turn_id: string
  type: string
  version: 2
}

const terminalEventTypes = new Set([
  "turn.completed",
  "turn.failed",
])
const canonicalSequence = /^(0|[1-9]\d*)$/

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function invalidStream() {
  return new Error("The response stream was invalid. Try again.")
}

function parseEventBlock(block: string): TurnStreamEvent | null {
  let eventName: string | undefined
  const dataLines: string[] = []

  for (const line of block.split(/\r?\n/)) {
    if (!line || line.startsWith(":")) continue
    if (line.startsWith("event:")) eventName = line.slice(6).trim()
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart())
  }

  if (!dataLines.length) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(dataLines.join("\n"))
  } catch {
    throw invalidStream()
  }

  const event = record(parsed)
  const data = record(event?.data)
  if (
    event?.version !== 2 ||
    typeof event.sequence !== "string" ||
    !canonicalSequence.test(event.sequence) ||
    typeof event.run_id !== "string" ||
    typeof event.turn_id !== "string" ||
    typeof event.type !== "string" ||
    !data ||
    (eventName !== undefined && eventName !== event.type)
  ) {
    throw invalidStream()
  }

  return {
    data,
    run_id: event.run_id,
    sequence: event.sequence,
    turn_id: event.turn_id,
    type: event.type,
    version: 2,
  }
}

function parseBuffer(input: string) {
  const events: TurnStreamEvent[] = []
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

async function readTurnStream(
  response: Response,
  onConversationStarted: (started: ConversationTurnStarted) => void,
  onEvent: (event: TurnStreamEvent) => void
) {
  if (!response.body) {
    throw new Error("The response did not include a stream.")
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let runId: string | undefined
  let turnId: string | undefined
  let lastSequence = -1n
  let conversationStarted = false
  let terminal = false

  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break

    buffer += decoder.decode(chunk.value, { stream: true })
    const parsed = parseBuffer(buffer)
    buffer = parsed.remainder

    for (const event of parsed.events) {
      const sequence = BigInt(event.sequence)
      if (
        terminal ||
        sequence <= lastSequence ||
        (runId !== undefined && event.run_id !== runId) ||
        (turnId !== undefined && event.turn_id !== turnId) ||
        (turnId === undefined && event.type !== "turn.started")
      ) {
        throw invalidStream()
      }

      runId ??= event.run_id
      turnId ??= event.turn_id
      lastSequence = sequence

      if (!conversationStarted && event.type === "turn.started") {
        const conversation = parseConversationSummary(event.data.conversation)
        if (!conversation) throw invalidStream()
        conversationStarted = true
        onConversationStarted({
          after: event.sequence,
          conversation,
          runId: event.run_id,
        })
      }

      onEvent(event)

      if (event.type === "turn.started") {
        await reader.cancel()
        return
      }

      terminal = terminalEventTypes.has(event.type)
      if (event.type === "turn.failed") {
        const error = record(event.data.error)
        throw new Error(
          typeof error?.message === "string"
            ? error.message
            : "The response could not be completed."
        )
      }
    }
  }

  buffer += decoder.decode()
  if (buffer.trim() || !conversationStarted || !terminal) {
    throw new Error("The response stream ended before completion. Try again.")
  }
}

export async function startConversationTurn(
  conversationId: string | null,
  input: ConversationTurnInput,
  onConversationStarted: (started: ConversationTurnStarted) => void,
  onEvent: (event: TurnStreamEvent) => void,
  signal: AbortSignal
) {
  let accepted = false
  const path = conversationId
    ? `/conversations/${encodeURIComponent(conversationId)}/turns`
    : "/conversations/turns"
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal,
  })

  if (!response.ok) {
    throw await apiErrorFromResponse(
      response,
      "Unable to send the message. Try again."
    )
  }

  try {
    await readTurnStream(
      response,
      (started) => {
        accepted = true
        onConversationStarted(started)
      },
      onEvent
    )
  } catch (error) {
    if (signal.aborted && accepted) return
    throw error
  }
}
