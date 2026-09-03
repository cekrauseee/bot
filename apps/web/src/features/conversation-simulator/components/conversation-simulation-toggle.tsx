import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

export function ConversationSimulationToggle({
  checked,
  onCheckedChange,
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <Label
      htmlFor="conversation-simulation-toggle"
      className="ms-auto h-7 shrink-0 gap-2 text-xs font-normal whitespace-nowrap text-muted-foreground [-webkit-app-region:no-drag]"
    >
      <span>Simulate conversation</span>
      <Switch
        checked={checked}
        id="conversation-simulation-toggle"
        onCheckedChange={onCheckedChange}
        size="sm"
      />
    </Label>
  )
}
