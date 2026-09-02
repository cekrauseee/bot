import {
  CircleCheckIcon,
  CircleDotIcon,
  CircleIcon,
  FileTextIcon,
  Globe2Icon,
  MessageSquareIcon,
  PencilLineIcon,
  SearchIcon,
  SquareTerminalIcon,
  WaypointsIcon,
  WrenchIcon,
} from "lucide-react"
import type { ReactNode } from "react"

import type { ProcessActivity } from "@/features/conversation/model"
import { cn } from "@/lib/utils"

function ActivityIcon({ children }: { children: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className="grid size-3.5 shrink-0 place-items-center text-muted-foreground [&_svg]:size-3.5 [&_svg]:stroke-[1.5]"
    >
      {children}
    </span>
  )
}

function ActivityRow({
  detail,
  icon,
  label,
  title,
  trailing,
}: {
  detail?: ReactNode
  icon: ReactNode
  label: ReactNode
  title?: string
  trailing?: ReactNode
}) {
  return (
    <div
      title={title}
      className="flex min-h-6 w-full min-w-0 items-center gap-2 leading-5"
    >
      <ActivityIcon>{icon}</ActivityIcon>
      <span className="min-w-0 flex-1 truncate text-muted-foreground">
        {label}
        {detail ? (
          <>
            <span aria-hidden="true"> · </span>
            {detail}
          </>
        ) : null}
      </span>
      {trailing ? <span className="shrink-0">{trailing}</span> : null}
    </div>
  )
}

function StepIcon({ status }: { status?: "active" | "complete" | "pending" }) {
  if (status === "complete") return <CircleCheckIcon />
  if (status === "active") return <CircleDotIcon />
  return <CircleIcon />
}

function ToolIcon({ action }: { action: string }) {
  const normalized = action.toLowerCase()
  if (normalized === "read") return <FileTextIcon />
  if (["edit", "updated", "write"].includes(normalized)) {
    return <PencilLineIcon />
  }
  if (["executed", "run"].includes(normalized)) {
    return <SquareTerminalIcon />
  }
  return <WrenchIcon />
}

function TraceIcon({ kind }: { kind: string }) {
  if (["message", "request"].includes(kind)) return <MessageSquareIcon />
  if (kind === "write") return <PencilLineIcon />
  if (kind === "run") return <SquareTerminalIcon />
  if (kind === "read") return <FileTextIcon />
  return <WaypointsIcon />
}

function ProcessActivityRow({ activity }: { activity: ProcessActivity }) {
  if (activity.type === "text") {
    return (
      <p className="min-h-6 py-0.5 text-sm leading-6 wrap-break-word whitespace-pre-wrap text-foreground/90">
        {activity.content}
      </p>
    )
  }

  if (activity.type === "step") {
    return (
      <ActivityRow
        icon={<StepIcon status={activity.status} />}
        label={activity.label}
        detail={activity.meta}
        title={[activity.label, activity.meta].filter(Boolean).join(" · ")}
      />
    )
  }

  if (activity.type === "search") {
    return (
      <div className="flex min-w-0 flex-col gap-2">
        <ActivityRow
          icon={<SearchIcon />}
          label={activity.query}
          title={activity.query}
          trailing={
            activity.moreCount ? (
              <span className="text-muted-foreground">
                +{activity.moreCount} more
              </span>
            ) : undefined
          }
        />
        {activity.results?.length ? (
          <div className="flex min-w-0 flex-col gap-2 ps-5.5">
            {activity.results.map((result) => {
              const content = (
                <>
                  <ActivityIcon>
                    <Globe2Icon />
                  </ActivityIcon>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    {result.title}
                    {result.domain ? ` · ${result.domain}` : ""}
                  </span>
                </>
              )

              return result.url ? (
                <a
                  key={result.id}
                  href={result.url}
                  title={[result.title, result.domain]
                    .filter(Boolean)
                    .join(" · ")}
                  className="flex min-h-6 min-w-0 items-center gap-2 rounded-md outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                >
                  {content}
                </a>
              ) : (
                <div
                  key={result.id}
                  title={[result.title, result.domain]
                    .filter(Boolean)
                    .join(" · ")}
                  className="flex min-h-6 min-w-0 items-center gap-2"
                >
                  {content}
                </div>
              )
            })}
          </div>
        ) : null}
      </div>
    )
  }

  if (activity.type === "tool") {
    const action =
      activity.action.charAt(0).toUpperCase() + activity.action.slice(1)
    const hasChanges =
      typeof activity.additions === "number" ||
      typeof activity.deletions === "number"

    return (
      <ActivityRow
        icon={<ToolIcon action={activity.action} />}
        label={action}
        detail={<span className="font-mono text-xs">{activity.target}</span>}
        title={`${action} · ${activity.target}`}
        trailing={
          hasChanges ? (
            <span className="font-mono text-xs text-muted-foreground tabular-nums">
              {typeof activity.additions === "number"
                ? `+${activity.additions}`
                : ""}
              {typeof activity.deletions === "number"
                ? ` −${activity.deletions}`
                : ""}
            </span>
          ) : undefined
        }
      />
    )
  }

  return (
    <ActivityRow
      icon={<TraceIcon kind={activity.kind} />}
      label={activity.label}
      detail={activity.detail}
      title={[activity.label, activity.detail].filter(Boolean).join(" · ")}
    />
  )
}

export function ProcessActivityList({
  activities,
  className,
}: {
  activities: readonly ProcessActivity[]
  className?: string
}) {
  return (
    <ol
      aria-label="Process activity"
      className={cn("flex min-w-0 flex-col gap-1", className)}
    >
      {activities.map((activity) => (
        <li key={activity.id} className="min-w-0">
          <ProcessActivityRow activity={activity} />
        </li>
      ))}
    </ol>
  )
}
