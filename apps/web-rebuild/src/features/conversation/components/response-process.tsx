import { useEffect, useState } from "react"
import { ChevronRightIcon } from "lucide-react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Separator } from "@/components/ui/separator"
import { ProcessActivityList } from "@/features/conversation/components/process-activity"
import type { ResponseProcessData } from "@/features/conversation/model"
import { cn } from "@/lib/utils"

function formatDuration(duration: number) {
  const seconds = Math.max(1, Math.round(duration))
  if (seconds < 60) return `${seconds}s`

  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`
}

function useProcessDuration(process: ResponseProcessData) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (process.status !== "processing" || process.startedAt === undefined) {
      return
    }
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [process.startedAt, process.status])

  return process.status === "processing" && process.startedAt !== undefined
    ? Math.max(1, (now - process.startedAt) / 1000)
    : process.durationSeconds
}

function ProcessLabel({
  duration,
  process,
}: {
  duration: number
  process: ResponseProcessData
}) {
  return (
    <span
      className={cn(
        "text-sm font-medium text-muted-foreground tabular-nums transition-colors group-hover/process-trigger:text-foreground",
        process.status === "processing" && "shimmer"
      )}
    >
      {process.status === "processing" ? "Processing" : "Processed"} for{" "}
      {formatDuration(duration)}
    </span>
  )
}

export function ResponseProcess({
  hasResponse,
  process,
}: {
  hasResponse: boolean
  process: ResponseProcessData
}) {
  const [disclosure, setDisclosure] = useState(() => ({
    open: process.status === "processing",
    status: process.status,
  }))
  const detailsOpen =
    disclosure.status === process.status
      ? disclosure.open
      : process.status === "processing"
  const duration = useProcessDuration(process)
  const hasDisclosure = process.activities.length > 0

  if (!hasDisclosure) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-4">
        <div className="-ms-1 flex h-7 max-w-[37em] min-w-0 items-center px-1">
          <ProcessLabel duration={duration} process={process} />
        </div>
        {process.status === "processed" && hasResponse ? <Separator /> : null}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Collapsible
        open={detailsOpen}
        onOpenChange={(open) => setDisclosure({ open, status: process.status })}
        className="flex w-full min-w-0 flex-col gap-4"
      >
        <div className="max-w-[37em] min-w-0">
          <CollapsibleTrigger className="group/process-trigger -ms-1 flex h-7 max-w-full items-center gap-1 rounded-md px-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background data-[panel-open]:[&_svg]:rotate-90">
            <ProcessLabel duration={duration} process={process} />
            <ChevronRightIcon
              aria-hidden="true"
              className="size-3.5 shrink-0 text-muted-foreground"
            />
          </CollapsibleTrigger>
        </div>
        {process.status === "processing" ? <Separator /> : null}
        <CollapsibleContent>
          <ProcessActivityList
            activities={process.activities}
            className="max-w-[37em]"
          />
        </CollapsibleContent>
      </Collapsible>
      {process.status === "processed" && hasResponse ? <Separator /> : null}
    </div>
  )
}
