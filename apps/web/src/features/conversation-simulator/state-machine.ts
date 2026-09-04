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

export function advanceSimulationSnapshot(
  snapshot: ConversationSimulationSnapshot,
  steps: readonly SimulationStep[],
  startedAt: number
): ConversationSimulationSnapshot {
  const nextIndex = snapshot.stepIndex + 1
  if (nextIndex >= steps.length) return snapshot

  const nextStep = steps[nextIndex]
  let record = snapshot.record
  let browserFrameScene = snapshot.browserFrameScene

  if (nextStep.event) {
    record = applyTurnEvent(
      record,
      nextStep.event,
      startedAt + nextIndex * 1_000
    )
  }
  if (nextStep.frame === null) browserFrameScene = undefined
  else if (nextStep.frame) browserFrameScene = nextStep.frame

  return {
    browserFrameScene,
    record,
    step: nextStep,
    stepIndex: nextIndex,
  }
}
