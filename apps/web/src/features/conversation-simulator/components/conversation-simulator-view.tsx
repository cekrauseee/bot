import { ConversationView } from "@/features/conversation/components/conversation-view"
import { SimulatorControls } from "@/features/conversation-simulator/components/simulator-controls"
import type { useConversationSimulator } from "@/features/conversation-simulator/use-conversation-simulator"

export default function ConversationSimulatorView({
  simulator,
}: {
  simulator: ReturnType<typeof useConversationSimulator>
}) {
  const record = simulator.snapshot.record

  return (
    <div className="flex size-full min-h-0 flex-col">
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
      <div className="min-h-0 flex-1">
        <ConversationView
          activeAssistantId={record.activeAssistantId}
          browserProjection={record.browserProjection}
          messages={record.messages}
        />
      </div>
    </div>
  )
}
