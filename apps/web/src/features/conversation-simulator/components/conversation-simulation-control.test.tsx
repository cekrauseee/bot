import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { ConversationSimulationControl } from "@/features/conversation-simulator/components/conversation-simulation-control"
import { createConversationSimulation } from "@/features/conversation-simulator/scenario"
import { simulationSnapshotAt } from "@/features/conversation-simulator/state-machine"

describe("conversation simulation control", () => {
  it("opens from a human-readable trigger and exposes its state", () => {
    const startedAt = Date.parse("2026-09-03T10:00:00Z")
    const steps = createConversationSimulation(startedAt)
    const simulator = {
      cycleSpeed: () => undefined,
      loop: true,
      pause: () => undefined,
      play: () => undefined,
      playing: false,
      reset: () => undefined,
      restart: () => undefined,
      seek: () => undefined,
      setLoop: () => undefined,
      snapshot: simulationSnapshotAt(steps, 0, startedAt),
      speed: 1,
      startWithPrompt: () => undefined,
      stop: () => undefined,
      stepCount: steps.length,
    }
    const markup = renderToStaticMarkup(
      React.createElement(ConversationSimulationControl, {
        checked: true,
        onCheckedChange: () => undefined,
        simulator,
      })
    )

    expect(markup).toContain("Simulation on")
    expect(markup).toContain('aria-haspopup="dialog"')
    expect(markup).toContain('aria-expanded="false"')
  })
})
