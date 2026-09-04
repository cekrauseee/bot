import { useCallback, useEffect, useMemo, useState } from "react"

import { createConversationSimulation } from "@/features/conversation-simulator/scenario"
import {
  advanceSimulationSnapshot,
  simulationSnapshotAt,
} from "@/features/conversation-simulator/state-machine"
import { markRunStopRequested } from "@/features/conversation/conversation-state"

function createTimeline(prompt?: string, stepIndex = 0) {
  const startedAt = Date.now()
  const steps = createConversationSimulation(startedAt, prompt)

  return {
    prompt,
    snapshot: simulationSnapshotAt(steps, stepIndex, startedAt),
    startedAt,
    steps,
  }
}

export function useConversationSimulator() {
  const [timeline, setTimeline] = useState(() => createTimeline())
  const [playing, setPlaying] = useState(false)
  const [loop, setLoop] = useState(true)
  const [speed, setSpeed] = useState(1)
  const [stopped, setStopped] = useState(false)
  const snapshot = useMemo(() => {
    const current = timeline.snapshot
    if (!stopped || !current.record.runId) return current
    return {
      ...current,
      record: markRunStopRequested(
        current.record,
        current.record.runId,
        true,
        timeline.startedAt + current.stepIndex * 1_000
      ),
    }
  }, [stopped, timeline.snapshot, timeline.startedAt])

  useEffect(() => {
    if (!playing) return

    const stepIndex = timeline.snapshot.stepIndex
    const atEnd = stepIndex >= timeline.steps.length - 1
    const timer = window.setTimeout(
      () => {
        if (atEnd) {
          if (!loop) {
            setPlaying(false)
            return
          }
          setTimeline((current) => createTimeline(current.prompt))
          return
        }
        setTimeline((current) => ({
          ...current,
          snapshot: advanceSimulationSnapshot(
            current.snapshot,
            current.steps,
            current.startedAt
          ),
        }))
      },
      (atEnd
        ? timeline.steps[stepIndex].delayMs
        : timeline.steps[stepIndex + 1].delayMs) / speed
    )

    return () => window.clearTimeout(timer)
  }, [loop, playing, speed, timeline.snapshot.stepIndex, timeline.steps])

  const play = useCallback(() => {
    setTimeline((current) =>
      current.snapshot.stepIndex >= current.steps.length - 1
        ? createTimeline(current.prompt)
        : current
    )
    setStopped(false)
    setPlaying(true)
  }, [])

  const pause = useCallback(() => setPlaying(false), [])

  const reset = useCallback(() => {
    setPlaying(false)
    setStopped(false)
    setTimeline((current) => createTimeline(current.prompt))
  }, [])

  const restart = useCallback(() => {
    setPlaying(true)
    setStopped(false)
    setTimeline((current) => createTimeline(current.prompt))
  }, [])

  const seek = useCallback((nextIndex: number) => {
    setPlaying(false)
    setStopped(false)
    setTimeline((current) => ({
      ...current,
      snapshot: simulationSnapshotAt(
        current.steps,
        nextIndex,
        current.startedAt
      ),
    }))
  }, [])

  const startWithPrompt = useCallback((nextPrompt: string) => {
    setTimeline(createTimeline(nextPrompt, 1))
    setStopped(false)
    setPlaying(true)
  }, [])

  const stop = useCallback(() => {
    setPlaying(false)
    setStopped(true)
  }, [])

  const cycleSpeed = useCallback(() => {
    setSpeed((current) => (current === 0.5 ? 1 : current === 1 ? 2 : 0.5))
  }, [])

  return {
    cycleSpeed,
    loop,
    pause,
    play,
    playing,
    reset,
    restart,
    seek,
    setLoop,
    snapshot,
    speed,
    startWithPrompt,
    stop,
    stepCount: timeline.steps.length,
  }
}
