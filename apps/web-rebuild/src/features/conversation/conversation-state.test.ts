import { describe, expect, it } from "vitest"

import type { TurnStreamEvent } from "@/features/composer/api"
import {
  applyTurnEvent,
  emptyConversationRecord,
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
  it("keeps a static process status when an assistant has no activities", () => {
    const message = mapApiMessage(
      apiMessage("assistant", "assistant", "completed", "Done.")
    )

    expect(message?.process).toMatchObject({
      activities: [],
      status: "processed",
    })
  })

  it("restores canonical and durable raw activity shapes", () => {
    const message = mapApiMessage({
      ...apiMessage("assistant", "assistant", "completed", "Done."),
      activities: [
        { id: "reasoning-1", type: "text", content: "Checked it." },
        {
          id: "tool-1",
          event_type: "tool.completed",
          label: "Read file",
          name: "read",
        },
      ],
    })

    expect(message?.process?.activities).toEqual([
      { id: "reasoning-1", type: "text", content: "Checked it." },
      {
        id: "tool-1",
        type: "tool",
        action: "read",
        target: "Read file",
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
        tool: { id: "tool", name: "read", label: "Read package.json" },
      }),
      Date.parse("2026-09-02T00:00:03.000Z")
    )
    state = applyTurnEvent(
      state,
      event(4, "reasoning.delta", { delta: "After search." }),
      Date.parse("2026-09-02T00:00:04.000Z")
    )
    state = applyTurnEvent(
      state,
      event(5, "text.delta", { delta: "Final answer." }),
      Date.parse("2026-09-02T00:00:05.000Z")
    )

    const assistant = state.messages.find(
      (message) => message.id === "assistant"
    )
    expect(assistant?.content).toBe("Final answer.")
    expect(assistant?.process?.status).toBe("processed")
    expect(assistant?.process?.activities).toEqual([
      expect.objectContaining({ type: "text", content: "Before search." }),
      expect.objectContaining({ type: "tool", action: "read" }),
      expect.objectContaining({ type: "text", content: "After search." }),
    ])
  })
})
