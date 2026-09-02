import { useEffect, useRef, useState } from "react"
import { CheckIcon, CopyIcon, TriangleAlertIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { MessageFooter } from "@/components/ui/message"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { formatMessageTimestamp } from "@/features/conversation/message-time"
import { cn } from "@/lib/utils"

type CopyStatus = "copied" | "error" | "idle"

function MessageCopyAction({
  content,
  edge,
}: {
  content: string
  edge: "end" | "start"
}) {
  const [status, setStatus] = useState<CopyStatus>("idle")
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current)
    },
    []
  )

  const copyMessage = async () => {
    if (resetTimer.current) clearTimeout(resetTimer.current)

    try {
      await navigator.clipboard.writeText(content)
      setStatus("copied")
    } catch {
      setStatus("error")
    }

    resetTimer.current = setTimeout(() => setStatus("idle"), 2000)
  }

  const label =
    status === "copied" ? "Copied" : status === "error" ? "Copy failed" : "Copy"
  const Icon =
    status === "copied"
      ? CheckIcon
      : status === "error"
        ? TriangleAlertIcon
        : CopyIcon

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`${label} message`}
            onClick={() => void copyMessage()}
            className={edge === "start" ? "-ms-1" : "-me-1"}
          />
        }
      >
        <Icon aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  )
}

function MessageTimestamp({ createdAt }: { createdAt?: string }) {
  if (!createdAt) return null

  const label = formatMessageTimestamp(createdAt)
  if (!label) return null

  return (
    <time
      dateTime={createdAt}
      className="text-xs leading-4 font-normal whitespace-nowrap text-muted-foreground tabular-nums"
    >
      {label}
    </time>
  )
}

export function HoverMessageMeta({
  align,
  copyText,
  createdAt,
}: {
  align: "end" | "start"
  copyText?: string
  createdAt?: string
}) {
  if (!copyText && !createdAt) return null
  const timestamp = <MessageTimestamp createdAt={createdAt} />
  const copyAction = copyText ? (
    <MessageCopyAction content={copyText} edge={align} />
  ) : null

  return (
    <MessageFooter
      className={cn(
        "pointer-events-none absolute bottom-0 flex h-6 w-fit items-center gap-1.5 p-0 opacity-0 transition-opacity duration-150 ease-out group-hover/message:pointer-events-auto group-hover/message:opacity-100 group-has-[:focus-visible]/message:pointer-events-auto group-has-[:focus-visible]/message:opacity-100 motion-reduce:transition-none [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100",
        align === "end" ? "end-0 justify-end" : "start-0 justify-start"
      )}
    >
      {align === "end" ? (
        <>
          {timestamp}
          {copyAction}
        </>
      ) : (
        <>
          {copyAction}
          {timestamp}
        </>
      )}
    </MessageFooter>
  )
}
