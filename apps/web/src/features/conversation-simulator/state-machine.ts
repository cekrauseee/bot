import {
  applyTurnEvent,
  emptyConversationRecord,
} from "@/features/conversation/conversation-state"
import type {
  BrowserFrameScene,
  SimulationStep,
} from "@/features/conversation-simulator/scenario"

export type ConversationSimulationSnapshot = {
  browserFrameScene?: BrowserFrameScene
  record: ReturnType<typeof emptyConversationRecord>
  step: SimulationStep
  stepIndex: number
}

export function simulationSnapshotAt(
  steps: readonly SimulationStep[],
  requestedIndex: number,
  startedAt: number
): ConversationSimulationSnapshot {
  if (!steps.length) {
    throw new Error("A conversation simulation needs at least one step.")
  }

  const stepIndex = Math.min(Math.max(0, requestedIndex), steps.length - 1)
  let record = emptyConversationRecord()
  let browserFrameScene: BrowserFrameScene | undefined

  for (let index = 0; index <= stepIndex; index += 1) {
    const current = steps[index]
    if (current.event) {
      record = applyTurnEvent(record, current.event, startedAt + index * 1_000)
    }
    if (current.frame === null) browserFrameScene = undefined
    else if (current.frame) browserFrameScene = current.frame
  }

  return {
    browserFrameScene,
    record,
    step: steps[stepIndex],
    stepIndex,
  }
}
