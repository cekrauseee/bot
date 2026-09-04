import { useId } from "react"
import { FlaskConicalIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { SimulatorControls } from "@/features/conversation-simulator/components/simulator-controls"
import type { useConversationSimulator } from "@/features/conversation-simulator/use-conversation-simulator"

export function ConversationSimulationControl({
  checked,
  onCheckedChange,
  simulator,
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  simulator: ReturnType<typeof useConversationSimulator>
}) {
  const enabledId = useId()

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            className="[-webkit-app-region:no-drag]"
            size="sm"
            variant={checked ? "secondary" : "ghost"}
          />
        }
      >
        <FlaskConicalIcon data-icon="inline-start" aria-hidden="true" />
        {checked ? "Simulation on" : "Simulation"}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(22rem,calc(100vw-2rem))] gap-0 p-0 motion-reduce:animate-none"
        sideOffset={8}
      >
        <div className="flex items-start gap-4 p-3">
          <PopoverHeader className="min-w-0 flex-1">
            <PopoverTitle>Conversation simulator</PopoverTitle>
            <PopoverDescription>
              Replay mocked events through the production conversation UI.
            </PopoverDescription>
          </PopoverHeader>
          <Label htmlFor={enabledId} className="h-7 shrink-0 gap-2">
            <span>{checked ? "On" : "Off"}</span>
            <Switch
              checked={checked}
              id={enabledId}
              onCheckedChange={onCheckedChange}
              size="sm"
            />
          </Label>
        </div>
        {checked ? (
          <>
            <Separator />
            <SimulatorControls
              loop={simulator.loop}
              onCycleSpeed={simulator.cycleSpeed}
              onLoopChange={simulator.setLoop}
              onPause={simulator.pause}
              onPlay={simulator.play}
              onReset={simulator.reset}
              onSeek={simulator.seek}
              playing={simulator.playing}
              speed={simulator.speed}
              step={simulator.snapshot.step}
              stepCount={simulator.stepCount}
              stepIndex={simulator.snapshot.stepIndex}
            />
          </>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
