import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  parseRunDiscovery,
  subscribeToRunDiscovery,
} from "@/features/app-shell/run-discovery"

const run = { id: "run-1", conversation_id: "conversation-1", turn_id: "turn-1", last_event_sequence: "9007199254740993" }

const discovery = (activeRun: unknown = run) =>
  JSON.stringify({ active_run: activeRun, type: "active_run.discovered", version: 2 })

class FakeWebSocket {
  static instances: FakeWebSocket[] = []
  static CLOSING = 2
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  readyState = 1
  readonly url: string
  constructor(url: string) {
    this.url = url
    FakeWebSocket.instances.push(this)
  }
  close() { if (this.readyState < FakeWebSocket.CLOSING) { this.readyState = 3; this.onclose?.() } }
  receive(data: unknown) { this.onmessage?.({ data }) }
}

describe("active run discovery transport", () => {
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
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

  it("parses versioned discoveries with a canonical durable cursor", () => {
    expect(parseRunDiscovery(discovery())).toEqual(run)
    expect(() => parseRunDiscovery(discovery({ id: "run-1" }))).toThrow()
    expect(() => parseRunDiscovery(JSON.stringify({ version: 1 }))).toThrow()
  })

  it("notifies on discovery, resyncs on close, and reconnects", () => {
    const onRun = vi.fn()
    const onResync = vi.fn()
    const stop = subscribeToRunDiscovery(onRun, onResync)
    const first = FakeWebSocket.instances[0]
    first.receive(discovery())
    expect(onRun).toHaveBeenCalledWith(run)
    first.close()
    expect(onResync).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(1_000)
    expect(FakeWebSocket.instances).toHaveLength(2)
    stop()
  })

  it("requests resync for malformed discovery messages", () => {
    const onResync = vi.fn()
    subscribeToRunDiscovery(vi.fn(), onResync)
    FakeWebSocket.instances[0].receive("bad message")
    expect(onResync).toHaveBeenCalledOnce()
  })
})
