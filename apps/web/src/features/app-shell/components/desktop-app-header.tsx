import { SidebarTrigger } from "@/components/ui/sidebar"
import { ConversationSimulationControl } from "@/features/conversation-simulator/components/conversation-simulation-control"
import type { useConversationSimulator } from "@/features/conversation-simulator/use-conversation-simulator"

type DesktopAppHeaderProps = {
  simulationEnabled?: boolean
  onSimulationEnabledChange?: (enabled: boolean) => void
  simulator?: ReturnType<typeof useConversationSimulator>
  title: string
}

export function DesktopAppHeader({
  simulationEnabled,
  onSimulationEnabledChange,
  simulator,
  title,
}: DesktopAppHeaderProps) {
  return (
    <header
      data-slot="desktop-app-header"
      className="absolute inset-x-0 top-0 z-30 flex h-9 min-w-0 shrink-0 items-center border-b bg-background ps-[5.25rem] pe-3 [-webkit-app-region:drag]"
    >
      <SidebarTrigger
        aria-label="Toggle sidebar"
        className="me-3 [-webkit-app-region:no-drag]"
      />
      <h1
        id="conversation-title"
        className="min-w-0 flex-1 truncate text-sm leading-5 font-semibold"
        title={title}
      >
        {title}
      </h1>
      {simulationEnabled !== undefined &&
      onSimulationEnabledChange &&
      simulator ? (
        <ConversationSimulationControl
          checked={simulationEnabled}
          onCheckedChange={onSimulationEnabledChange}
          simulator={simulator}
        />
      ) : null}
    </header>
  )
}
