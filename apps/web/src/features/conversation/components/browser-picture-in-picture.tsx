import { Globe2Icon } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type {
  BrowserFrame,
  BrowserProjection,
} from "@/features/conversation/model"

export function BrowserPictureInPicture({
  frame,
  projection,
}: {
  frame?: BrowserFrame
  projection?: BrowserProjection | null
}) {
  if (
    !frame ||
    !projection ||
    !["launching", "live", "awaiting_user"].includes(projection.state)
  )
    return null

  const label =
    projection.state === "awaiting_user"
      ? "Browser needs your input"
      : projection.state === "launching"
        ? "Opening browser"
        : "Working in the browser"
  return (
    <aside
      aria-label="Browser preview"
      className="pointer-events-none fixed inset-x-4 bottom-[calc(var(--composer-dock-height,4rem)+1rem)] z-10 flex justify-end sm:inset-x-6"
    >
      <Card className="pointer-events-auto w-full max-w-sm shadow-lg">
        <CardHeader className="flex flex-row items-center gap-2 py-3">
          <Globe2Icon
            aria-hidden="true"
            className="size-4 text-muted-foreground"
          />
          <CardTitle className="min-w-0 truncate text-sm">{label}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <img
            src={`data:${frame.mimeType};base64,${frame.base64}`}
            alt="Current browser page"
            className="aspect-video w-full rounded-lg object-contain outline outline-1 outline-black/10 dark:outline-white/10"
          />
        </CardContent>
      </Card>
    </aside>
  )
}
