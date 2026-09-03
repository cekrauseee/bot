import { describe, expect, it } from "vitest"

import type { TurnStreamEvent } from "@/features/composer/api"
import {
  applyTurnEvent,
  applyBrowserFrame,
  consumeTurnSpacerAnchor,
  emptyConversationRecord,
  markRunStopRequested,
  mapApiMessage,
} from "@/features/conversation/conversation-state"

const event = (
  sequence: number,
  type: string,
  data: Record<string, unknown>
): TurnStreamEvent => ({
  data,
  run_id: "run-1",
  sequence: String(sequence),
  turn_id: "turn-1",
  type,
  version: 2,
})

const apiMessage = (
  id: string,
  role: "assistant" | "user",
  status: string,
  content = ""
) => ({
  activities: [],
  content,
  created_at: "2026-09-02T00:00:00.000Z",
  error_message: null,
  id,
  reasoning: null,
  role,
  status,
  updated_at: "2026-09-02T00:00:00.000Z",
})

describe("conversation state", () => {
  it("stores transient browser frames for an active run and clears them at terminal state", () => {
    let state = applyTurnEvent(
      emptyConversationRecord(),
      event(0, "turn.started", {
        user_message: apiMessage("user", "user", "completed", "Open a page."),
        assistant_message: apiMessage("assistant", "assistant", "streaming"),
      }),
      0
    )
    state = { ...state, browserProjection: { state: "live", control: "agent" } }
    state = applyBrowserFrame(
      state,
      {
        base64: "cG5n",
        mimeType: "image/png",
        capturedAt: "2026-09-03T00:00:00Z",
      },
      "run-1"
    )
    expect(state.browserFrame?.base64).toBe("cG5n")
    const newer = applyBrowserFrame(
      { ...state, runId: "new-run" },
      {
        base64: "bGF0ZQ==",
        mimeType: "image/png",
        capturedAt: "2026-09-03T00:00:01Z",
      },
      "run-1"
    )
    expect(newer.browserFrame).toBe(state.browserFrame)
    state = applyTurnEvent(state, event(1, "turn.completed", {}), 1)
    expect(state.browserFrame).toBeUndefined()
    expect(state.browserProjection).toBeUndefined()
  })

  it.each(["stopped", "failed"] as const)(
    "clears the browser frame when browser projection becomes %s",
    (stateValue) => {
      let state = applyTurnEvent(emptyConversationRecord(), event(0, "turn.started", {
        user_message: apiMessage("user", "user", "completed", "Open a page."),
        assistant_message: apiMessage("assistant", "assistant", "streaming"),
      }), 0)
      state = { ...state, browserFrame: { base64: "cG5n", mimeType: "image/png", capturedAt: "2026-09-03T00:00:00Z" } }
      state = applyTurnEvent(state, event(1, "tool.completed", {
        tool: { id: "browser", name: "browser_close", status: "completed" },
        browser_projection: { state: stateValue, control: "agent" },
      }), 1)
      expect(state.browserFrame).toBeUndefined()
      expect(state.browserProjection?.state).toBe(stateValue)
    },
  )

  it("keeps a static process status for a completed direct response", () => {
    const message = mapApiMessage(
      apiMessage("assistant", "assistant", "completed", "Done.")
    )

    expect(message?.process).toMatchObject({
      activities: [],
      status: "processed",
    })
  })

  it("omits an empty cancelled assistant that never produced output", () => {
    const message = mapApiMessage(
      apiMessage("assistant", "assistant", "cancelled")
    )

    expect(message).toBeNull()
  })

  it("restores canonical and durable raw activity shapes", () => {
    const message = mapApiMessage({
      ...apiMessage("assistant", "assistant", "completed", "Done."),
      activities: [
        { id: "reasoning-1", type: "text", content: "Checked it." },
        {
          id: "tool-1",
          event_type: "tool.completed",
          label: "Read files",
          name: "filesystem_read",
          status: "completed",
          target: "/workspace/package.json",
        },
      ],
    })

    expect(message?.process?.activities).toEqual([
      { id: "reasoning-1", type: "text", content: "Checked it." },
      {
        id: "tool-1",
        type: "tool",
        action: "filesystem_read",
        status: "completed",
        target: "/workspace/package.json",
      },
    ])
  })

  it("streams chronological process activity and closes it on final text", () => {
    let state = applyTurnEvent(
      emptyConversationRecord(),
      event(0, "turn.started", {
        user_message: apiMessage("user", "user", "completed", "Help me."),
        assistant_message: apiMessage("assistant", "assistant", "streaming"),
      }),
      Date.parse("2026-09-02T00:00:00.000Z")
    )

    state = applyTurnEvent(
      state,
      event(1, "reasoning.delta", { delta: "Before " }),
      Date.parse("2026-09-02T00:00:01.000Z")
    )
    state = applyTurnEvent(
      state,
      event(2, "reasoning.delta", { delta: "search." }),
      Date.parse("2026-09-02T00:00:02.000Z")
    )
    state = applyTurnEvent(
      state,
      event(3, "tool.started", {
        tool: {
          id: "tool",
          name: "filesystem_read",
          label: "Reading files",
          status: "in_progress",
          target: "/workspace/package.json",
        },
      }),
      Date.parse("2026-09-02T00:00:03.000Z")
    )
    state = applyTurnEvent(
      state,
      event(4, "tool.completed", {
        tool: {
          id: "tool",
          name: "filesystem_read",
          label: "Read files",
          status: "completed",
        },
      }),
      Date.parse("2026-09-02T00:00:04.000Z")
    )
    state = applyTurnEvent(
      state,
      event(5, "reasoning.delta", { delta: "After search." }),
      Date.parse("2026-09-02T00:00:05.000Z")
    )
    state = applyTurnEvent(
      state,
      event(6, "text.delta", { delta: "Final answer." }),
      Date.parse("2026-09-02T00:00:06.000Z")
    )

    const assistant = state.messages.find(
      (message) => message.id === "assistant"
    )
    expect(state.turnSpacerAnchorId).toBe("user")
    expect(assistant?.content).toBe("Final answer.")
    expect(assistant?.process?.status).toBe("processed")
    expect(assistant?.process?.activities).toEqual([
      expect.objectContaining({ type: "text", content: "Before search." }),
      expect.objectContaining({
        type: "tool",
        action: "filesystem_read",
        status: "completed",
        target: "/workspace/package.json",
      }),
      expect.objectContaining({ type: "text", content: "After search." }),
    ])

    const consumed = consumeTurnSpacerAnchor(state, "user")
    expect(consumed.turnSpacerAnchorId).toBeUndefined()
    expect(consumed.messages).toBe(state.messages)
  })

  it("ignores duplicate deltas while advancing the durable cursor", () => {
    let state = applyTurnEvent(
      emptyConversationRecord(),
      event(0, "turn.started", {
        user_message: apiMessage("user", "user", "completed", "Hello"),
        assistant_message: apiMessage("assistant", "assistant", "streaming"),
      }),
      0
    )
    state = applyTurnEvent(state, event(1, "text.delta", { delta: "A" }), 1)
    const duplicate = applyTurnEvent(
      state,
      event(1, "text.delta", { delta: "A" }),
      1
    )
    expect(duplicate).toBe(state)
    state = applyTurnEvent(state, event(2, "text.delta", { delta: "B" }), 2)
    expect(
      state.messages.find((message) => message.id === "assistant")?.content
    ).toBe("AB")
    expect(state.lastEventSequence).toBe("2")
  })

  it("freezes visible streaming immediately after stop is requested", () => {
    let state = applyTurnEvent(
      emptyConversationRecord(),
      event(0, "turn.started", {
        user_message: apiMessage("user", "user", "completed", "Hello"),
        assistant_message: apiMessage("assistant", "assistant", "streaming"),
      }),
      0
    )
    state = applyTurnEvent(
      state,
      event(1, "text.delta", { delta: "Before" }),
      1
    )
    state = markRunStopRequested(state, "run-1", true)
    state = applyTurnEvent(
      state,
      event(2, "text.delta", { delta: " after" }),
      2
    )

    expect(state.stopRequested).toBe(true)
    expect(state.activeAssistantId).toBeUndefined()
    expect(state.lastEventSequence).toBe("2")
    expect(
      state.messages.find((message) => message.id === "assistant")?.content
    ).toBe("Before")

    state = applyTurnEvent(
      state,
      event(3, "turn.failed", {
        error: { code: "cancelled", message: "Turn cancelled." },
      }),
      3
    )
    expect(state.runId).toBeUndefined()
    expect(state.stopRequested).toBeUndefined()
  })

})
