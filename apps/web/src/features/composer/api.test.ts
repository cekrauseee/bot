import { describe, expect, it, vi } from "vitest"

import {
  startConversationTurn,
  type TurnStreamEvent,
} from "@/features/composer/api"

const conversation = {
  created_at: "2026-09-03T00:00:00.000Z",
  id: "conversation-1",
  model: "gpt-5.6-sol",
  model_updated_at: "2026-09-03T00:00:00.000Z",
  pinned_order: null,
  pin_updated_at: null,
  project_id: null,
  reasoning_effort: "medium",
  speed: "standard" as const,
  title: "New conversation",
  title_updated_at: null,
  updated_at: "2026-09-03T00:00:00.000Z",
}

const streamEvent = (sequence: string, type: string, data: Record<string, unknown>) =>
  `event: ${type}\ndata: ${JSON.stringify({ data, run_id: "run-1", sequence, turn_id: "turn-1", type, version: 2 })}\n\n`

describe("conversation turn stream", () => {
  it("applies turn.started and cancels the reader before later same-chunk events", async () => {
    const started = streamEvent("0", "turn.started", {
      assistant_message: {
        content: "",
        created_at: "2026-09-03T00:00:00.000Z",
        id: "assistant-1",
        role: "assistant",
        status: "streaming",
        updated_at: "2026-09-03T00:00:00.000Z",
      },
      conversation,
      user_message: {
        content: "Hello",
        created_at: "2026-09-03T00:00:00.000Z",
        id: "user-1",
        role: "user",
        status: "completed",
        updated_at: "2026-09-03T00:00:00.000Z",
      },
    })
    const later = streamEvent("1", "text.delta", { delta: "ignored" })
    const cancel = vi.fn()
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(started + later))
      },
      cancel,
    })
    const fetchMock = vi.fn().mockResolvedValue(new Response(body, { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    try {
      const onStarted = vi.fn()
      const onEvent = vi.fn<(event: TurnStreamEvent) => void>()
      await startConversationTurn(
        null,
        { message: "Hello", model: "gpt-5.6-sol", reasoning_effort: "medium", speed: "standard" },
        onStarted,
        onEvent,
        new AbortController().signal
      )
      expect(onStarted).toHaveBeenCalledOnce()
      expect(onEvent).toHaveBeenCalledOnce()
      expect(onEvent.mock.calls[0][0].type).toBe("turn.started")
      expect(cancel).toHaveBeenCalledOnce()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
