import { describe, expect, it } from "vitest"

import { createConversationSimulation } from "@/features/conversation-simulator/scenario"
import {
  advanceSimulationSnapshot,
  simulationSnapshotAt,
} from "@/features/conversation-simulator/state-machine"

const startedAt = Date.parse("2026-09-03T10:00:00Z")

describe("conversation simulator state machine", () => {
  it("starts with an empty conversation", () => {
    const steps = createConversationSimulation(startedAt)
    const snapshot = simulationSnapshotAt(steps, 0, startedAt)

    expect(snapshot.step.label).toBe("Ready")
    expect(snapshot.record.messages).toEqual([])
    expect(snapshot.record.runId).toBeUndefined()
  })

  it("reconstructs the browser intervention state at an arbitrary step", () => {
    const steps = createConversationSimulation(startedAt)
    const interventionIndex = steps.findIndex(
      (step) => step.label === "User has browser control"
    )
    const snapshot = simulationSnapshotAt(steps, interventionIndex, startedAt)

    expect(snapshot.browserFrameScene).toBe("approval")
    expect(snapshot.record.browserProjection).toMatchObject({
      control: "user",
      state: "awaiting_user",
    })
    expect(snapshot.record.activeAssistantId).toBe("simulation-assistant-1")
  })

  it("projects GitHub skill and MCP activity into the conversation process", () => {
    const steps = createConversationSimulation(startedAt)
    const githubReadIndex = steps.findIndex(
      (step) => step.label === "GitHub brief read"
    )
    const snapshot = simulationSnapshotAt(steps, githubReadIndex, startedAt)
    const activities = snapshot.record.messages[1]?.process?.activities ?? []

    expect(activities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "github-skill",
          name: "github",
          status: "completed",
          type: "skill",
        }),
        expect.objectContaining({
          action: "search_repositories",
          id: "github-search-repositories",
          status: "completed",
          target: "org:acme workspace launch",
          type: "tool",
        }),
        expect.objectContaining({
          action: "get_file_contents",
          id: "github-read-launch-brief",
          status: "completed",
          target: "acme/atlas/product/launch-brief.md @ refs/heads/main",
          type: "tool",
        }),
      ])
    )
  })

  it("builds both completed turns at the final state", () => {
    const steps = createConversationSimulation(startedAt)
    const snapshot = simulationSnapshotAt(steps, steps.length - 1, startedAt)

    expect(snapshot.record.messages).toHaveLength(4)
    expect(snapshot.record.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
    ])
    expect(snapshot.record.runId).toBeUndefined()
    expect(snapshot.record.browserProjection).toBeUndefined()
    expect(snapshot.browserFrameScene).toBeUndefined()
  })

  it("uses a custom first message without changing the scenario", () => {
    const steps = createConversationSimulation(startedAt, "Custom prompt")
    const snapshot = simulationSnapshotAt(steps, 1, startedAt)

    expect(snapshot.record.messages[0]?.content).toBe("Custom prompt")
  })

  it("advances by applying only the next mocked event", () => {
    const steps = createConversationSimulation(startedAt)
    const started = simulationSnapshotAt(steps, 1, startedAt)
    const userMessage = started.record.messages[0]

    const advanced = advanceSimulationSnapshot(started, steps, startedAt)

    expect(advanced.stepIndex).toBe(2)
    expect(advanced.record.messages[0]).toBe(userMessage)
    expect(advanced.record.messages[1]?.process?.activities[0]).toMatchObject({
      content: expect.stringContaining("market research"),
      type: "text",
    })
  })
})
