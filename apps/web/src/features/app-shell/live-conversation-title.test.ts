import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { ConversationSummary } from "@/features/app-shell/api"
import {
  agentRunSocketUrl,
  parseEventSequence,
  parseRunSocketMessage,
  subscribeToConversationTitle,
} from "@/features/app-shell/live-conversation-title"

const runId = "run-id"
const conversationId = "conversation-id"

function conversation(): ConversationSummary {
  return {
    id: conversationId,
    title: "Generated title",
    model: "gpt-5.6-sol",
    model_updated_at: "2026-09-02T10:00:00.000Z",
    project_id: null,
    pinned_order: null,
    pin_updated_at: null,
    title_updated_at: "2026-09-02T10:00:02.000Z",
    created_at: "2026-09-02T10:00:00.000Z",
    updated_at: "2026-09-02T10:00:00.000Z",
  }
}

function event(sequence: string, type: string, data: Record<string, unknown>) {
  return JSON.stringify({
    version: 2,
    sequence,
    run_id: runId,
    turn_id: "turn-id",
    type,
    data,
  })
}

class FakeWebSocket {
  static CLOSING = 2
  static instances: FakeWebSocket[] = []

  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  onmessage: ((message: { data: unknown }) => void) | null = null
  readyState = 1
  readonly url: string

  constructor(url: string) {
    this.url = url
    FakeWebSocket.instances.push(this)
  }

  close() {
    if (this.readyState >= FakeWebSocket.CLOSING) return
    this.readyState = 3
    this.onclose?.()
  }

  receive(data: unknown) {
    this.onmessage?.({ data })
  }
}

describe("live conversation title protocol", () => {
  beforeEach(() => {
    FakeWebSocket.instances = []
    vi.useFakeTimers()
    vi.stubGlobal("WebSocket", FakeWebSocket)
    vi.stubGlobal("window", {
      clearTimeout: globalThis.clearTimeout,
      location: { origin: "https://mybot.example" },
      setTimeout: globalThis.setTimeout,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it("keeps canonical bigint cursors and builds the WebSocket URL", () => {
    expect(parseEventSequence("9007199254740993")).toBe(9_007_199_254_740_993n)
    expect(() => parseEventSequence("01")).toThrow(/invalid/)
    expect(() => parseEventSequence(1)).toThrow(/invalid/)
    expect(agentRunSocketUrl(runId, "42", "https://mybot.example")).toBe(
      `ws://localhost:8000/agent-runs/${runId}/subscribe?after=42`
    )
  })

  it("parses durable title events and ignores valid transient frames", () => {
    expect(
      parseRunSocketMessage(
        event("1", "conversation.title.updated", {
          conversation: conversation(),
        })
      )
    ).toMatchObject({
      kind: "durable",
      event: { runId, sequence: 1n, type: "conversation.title.updated" },
    })
    expect(
      parseRunSocketMessage(
        JSON.stringify({
          version: 2,
          run_id: runId,
          type: "browser.frame",
          data: { base64: "frame" },
        })
      )
    ).toEqual({ kind: "transient", runId })
  })

  it("reconnects from the last durable cursor and applies one title", () => {
    const onConversationTitle = vi.fn()
    const onResync = vi.fn()
    const onClosed = vi.fn()

    subscribeToConversationTitle({
      after: "0",
      conversationId,
      onClosed,
      onConversationTitle,
      onResync,
      runId,
    })

    const first = FakeWebSocket.instances[0]
    first.receive(event("1", "reasoning.delta", { delta: "Working" }))
    first.close()
    vi.advanceTimersByTime(1_000)

    const second = FakeWebSocket.instances[1]
    expect(second.url).toContain("after=1")
    second.receive(
      event("2", "conversation.title.updated", {
        conversation: conversation(),
      })
    )

    expect(onConversationTitle).toHaveBeenCalledOnce()
    expect(onConversationTitle).toHaveBeenCalledWith(conversation())
    expect(onClosed).toHaveBeenCalledOnce()
    expect(onResync).not.toHaveBeenCalled()
    expect(second.readyState).toBe(3)
  })

  it("stops and requests a canonical resync for a stale run", () => {
    const onResync = vi.fn()

    subscribeToConversationTitle({
      after: "0",
      conversationId,
      onConversationTitle: vi.fn(),
      onResync,
      runId,
    })

    FakeWebSocket.instances[0].receive(
      JSON.stringify({
        version: 2,
        sequence: "1",
        run_id: "different-run",
        turn_id: "turn-id",
        type: "reasoning.delta",
        data: { delta: "Invalid" },
      })
    )

    expect(onResync).toHaveBeenCalledOnce()
    expect(FakeWebSocket.instances[0].readyState).toBe(3)
  })
})
