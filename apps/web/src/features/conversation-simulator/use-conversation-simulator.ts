import { useCallback, useEffect, useMemo, useState } from "react"

import { createConversationSimulation } from "@/features/conversation-simulator/scenario"
import { simulationSnapshotAt } from "@/features/conversation-simulator/state-machine"
import { markRunStopRequested } from "@/features/conversation/conversation-state"

export function useConversationSimulator() {
  const [startedAt, setStartedAt] = useState(() => Date.now())
  const [prompt, setPrompt] = useState<string>()
  const [stepIndex, setStepIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [loop, setLoop] = useState(true)
  const [speed, setSpeed] = useState(1)
  const [stopped, setStopped] = useState(false)
  const steps = useMemo(
    () => createConversationSimulation(startedAt, prompt),
    [prompt, startedAt]
  )
  const snapshot = useMemo(() => {
    const current = simulationSnapshotAt(steps, stepIndex, startedAt)
    if (!stopped || !current.record.runId) return current
    return {
      ...current,
      record: markRunStopRequested(
        current.record,
        current.record.runId,
        true,
        startedAt + stepIndex * 1_000
      ),
    }
  }, [startedAt, stepIndex, steps, stopped])

  useEffect(() => {
    if (!playing) return

    const atEnd = stepIndex >= steps.length - 1
    const timer = window.setTimeout(
      () => {
        if (atEnd) {
          if (!loop) {
            setPlaying(false)
            return
          }
          setStartedAt(Date.now())
          setStepIndex(0)
          return
        }
        setStepIndex((current) => current + 1)
      },
      (atEnd ? steps[stepIndex].delayMs : steps[stepIndex + 1].delayMs) / speed
    )

    return () => window.clearTimeout(timer)
  }, [loop, playing, speed, stepIndex, steps])

  const play = useCallback(() => {
    if (stepIndex >= steps.length - 1) {
      setStartedAt(Date.now())
      setStepIndex(0)
    }
    setStopped(false)
    setPlaying(true)
  }, [stepIndex, steps.length])

  const pause = useCallback(() => setPlaying(false), [])

  const reset = useCallback(() => {
    setPlaying(false)
    setStopped(false)
    setStartedAt(Date.now())
    setStepIndex(0)
  }, [])

  const restart = useCallback(() => {
    setPlaying(true)
    setStopped(false)
    setStartedAt(Date.now())
    setStepIndex(0)
  }, [])

  const seek = useCallback(
    (nextIndex: number) => {
      setPlaying(false)
      setStopped(false)
      setStepIndex(Math.min(Math.max(0, nextIndex), steps.length - 1))
    },
    [steps.length]
  )

  const startWithPrompt = useCallback((nextPrompt: string) => {
    setPrompt(nextPrompt)
    setStartedAt(Date.now())
    setStepIndex(1)
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
    stepCount: steps.length,
  }
}
