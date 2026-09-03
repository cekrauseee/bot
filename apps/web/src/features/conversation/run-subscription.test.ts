import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  parseRunSocketMessage,
  subscribeToRun,
} from "@/features/conversation/run-subscription"

const runId = "run-1"
const turnId = "turn-1"

const message = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    data: { delta: "hello" },
    run_id: runId,
    sequence: "1",
    turn_id: turnId,
    type: "text.delta",
    version: 2,
    ...overrides,
  })

class FakeWebSocket {
  static CLOSING = 2
  static instances: FakeWebSocket[] = []
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
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

describe("run subscription transport", () => {
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

  it("parses durable events and rejects malformed messages", () => {
    expect(parseRunSocketMessage(message()).kind).toBe("event")
    expect(() => parseRunSocketMessage("not json")).toThrow()
    expect(() => parseRunSocketMessage(message({ sequence: "01" }))).toThrow()
  })

  it("reconnects from the last bigint cursor and ignores duplicate delivery", () => {
    const onEvent = vi.fn()
    const stop = subscribeToRun({
      after: "0",
      runId,
      onEvent,
      onResync: vi.fn(),
    })
    const first = FakeWebSocket.instances[0]
    first.receive(message({ sequence: "9007199254740993" }))
    first.receive(message({ sequence: "9007199254740993" }))
    expect(onEvent).toHaveBeenCalledOnce()

    first.close()
    vi.advanceTimersByTime(1_000)
    expect(FakeWebSocket.instances[1].url).toContain(
      "after=9007199254740993"
    )
    stop()
  })

  it.each([
    ["malformed", "not json"],
    ["run mismatch", message({ run_id: "other-run" })],
    ["turn mismatch", message({ turn_id: "other-turn" })],
  ])("requests resync for %s events", (_label, payload) => {
    const onResync = vi.fn()
    subscribeToRun({
      after: "0",
      runId,
      turnId,
      onEvent: vi.fn(),
      onResync,
    })
    FakeWebSocket.instances[0].receive(payload)
    expect(onResync).toHaveBeenCalledOnce()
    expect(FakeWebSocket.instances[0].readyState).toBe(3)
  })
})
