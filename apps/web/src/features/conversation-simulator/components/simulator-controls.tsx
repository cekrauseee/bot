import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import type { SimulationStep } from "@/features/conversation-simulator/scenario"

export function SimulatorControls({
  loop,
  onCycleSpeed,
  onLoopChange,
  onPause,
  onPlay,
  onReset,
  onSeek,
  playing,
  speed,
  step,
  stepCount,
  stepIndex,
}: {
  loop: boolean
  onCycleSpeed: () => void
  onLoopChange: (checked: boolean) => void
  onPause: () => void
  onPlay: () => void
  onReset: () => void
  onSeek: (index: number) => void
  playing: boolean
  speed: number
  step: SimulationStep
  stepCount: number
  stepIndex: number
}) {
  return (
    <div
      aria-label="Conversation simulation controls"
      className="flex flex-col gap-4 p-3"
      role="group"
    >
      <div className="flex items-center gap-3">
        <div
          aria-label="Playback controls"
          className="flex items-center gap-1 rounded-xl bg-muted p-1"
          role="group"
        >
          <Button
            aria-label="Reset simulation"
            onClick={onReset}
            size="icon-sm"
            variant="ghost"
          >
            <RotateCcwIcon aria-hidden="true" />
          </Button>
          <Button
            aria-label="Previous state"
            disabled={stepIndex === 0}
            onClick={() => onSeek(stepIndex - 1)}
            size="icon-sm"
            variant="ghost"
          >
            <ChevronLeftIcon aria-hidden="true" />
          </Button>
          <Button
            aria-label={playing ? "Pause simulation" : "Play simulation"}
            onClick={playing ? onPause : onPlay}
            size="icon-sm"
          >
            {playing ? (
              <PauseIcon aria-hidden="true" fill="currentColor" />
            ) : (
              <PlayIcon aria-hidden="true" fill="currentColor" />
            )}
          </Button>
          <Button
            aria-label="Next state"
            disabled={stepIndex === stepCount - 1}
            onClick={() => onSeek(stepIndex + 1)}
            size="icon-sm"
            variant="ghost"
          >
            <ChevronRightIcon aria-hidden="true" />
          </Button>
        </div>

        <Button
          aria-label={`Playback speed ${speed} times. Change speed`}
          className="ms-auto min-w-12 font-mono tabular-nums"
          onClick={onCycleSpeed}
          size="sm"
          variant="outline"
        >
          {speed}×
        </Button>
      </div>

      <Label htmlFor="simulator-loop" className="h-7 justify-between gap-3">
        <span>Loop scenario</span>
        <Switch
          checked={loop}
          id="simulator-loop"
          onCheckedChange={onLoopChange}
          size="sm"
        />
      </Label>

      <div className="flex min-w-0 items-center gap-3">
        <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
          {String(stepIndex + 1).padStart(2, "0")}/
          {String(stepCount).padStart(2, "0")}
        </span>
        <input
          aria-label="Simulation state"
          aria-valuetext={`${stepIndex + 1} of ${stepCount}: ${step.label}`}
          className="h-6 min-w-0 flex-1 cursor-pointer accent-foreground"
          max={stepCount - 1}
          min={0}
          onChange={(event) => onSeek(Number(event.currentTarget.value))}
          step={1}
          type="range"
          value={stepIndex}
        />
      </div>

      <div className="min-w-0" aria-live="polite" aria-atomic="true">
        <p className="text-sm font-medium">{step.label}</p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {step.description}
        </p>
      </div>
    </div>
  )
}
