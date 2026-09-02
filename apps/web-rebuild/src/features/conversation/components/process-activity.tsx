import {
  ChevronRightIcon,
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

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import type { ProcessActivity } from "@/features/conversation/model"
import {
  groupProcessActivities,
  processActivityGroupLabel,
  processToolCopy,
  type ProcessActivityFamily,
  type ProcessActivityItem,
} from "@/features/conversation/process-activity-model"
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
  separator = "dot",
  title,
  trailing,
}: {
  detail?: ReactNode
  icon: ReactNode
  label: ReactNode
  separator?: "dot" | "space"
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
            {separator === "dot" ? (
              <>
                <span aria-hidden="true"> · </span>
                <span className="sr-only">, </span>
              </>
            ) : (
              " "
            )}
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
  const normalized = action.toLowerCase().replace(/[.\s-]+/g, "_")
  if (
    ["filesystem_list", "filesystem_read", "list", "read"].includes(normalized)
  ) {
    return <FileTextIcon />
  }
  if (["edit", "filesystem_write", "updated", "write"].includes(normalized)) {
    return <PencilLineIcon />
  }
  if (["executed", "run", "shell_exec"].includes(normalized)) {
    return <SquareTerminalIcon />
  }
  if (normalized.startsWith("browser_")) return <Globe2Icon />
  if (normalized === "ask_user") return <MessageSquareIcon />
  return <WrenchIcon />
}

const isCommandAction = (action: string) =>
  ["executed", "run", "shell_exec"].includes(
    action.toLowerCase().replace(/[.\s-]+/g, "_")
  )

function GroupIcon({ family }: { family: ProcessActivityFamily }) {
  if (["files-inspected", "files-read"].includes(family)) {
    return <FileTextIcon />
  }
  if (family === "files-updated") return <PencilLineIcon />
  if (family === "commands") return <SquareTerminalIcon />
  if (family === "web-search") return <SearchIcon />
  return <Globe2Icon />
}

function TraceIcon({ kind }: { kind: string }) {
  if (["message", "request"].includes(kind)) return <MessageSquareIcon />
  if (kind === "write") return <PencilLineIcon />
  if (kind === "run") return <SquareTerminalIcon />
  if (kind === "read") return <FileTextIcon />
  return <WaypointsIcon />
}

function CommandActivity({
  activity,
}: {
  activity: Extract<ProcessActivity, { type: "tool" }>
}) {
  const copy = processToolCopy(activity)
  const command = activity.target?.trim()

  if (!command) {
    return (
      <ActivityRow
        icon={<SquareTerminalIcon />}
        label={copy.label}
        title={copy.label}
      />
    )
  }

  const summary = command.split("\n", 1)[0]

  return (
    <Collapsible className="flex min-w-0 flex-col">
      <CollapsibleTrigger className="group/command -ms-1 flex min-h-6 max-w-full min-w-0 items-center gap-2 rounded-md px-1 text-start leading-5 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background data-[panel-open]:[&_.command-chevron]:rotate-90">
        <ActivityIcon>
          <SquareTerminalIcon />
        </ActivityIcon>
        <span className="shrink-0 text-muted-foreground">{copy.label}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
          {summary}
        </span>
        <ChevronRightIcon
          aria-hidden="true"
          className="command-chevron size-3.5 shrink-0 text-muted-foreground motion-safe:transition-transform"
        />
      </CollapsibleTrigger>
      <CollapsibleContent hiddenUntilFound className="ps-5.5 pt-1">
        <pre className="max-w-full overflow-x-auto rounded-lg border border-border/60 bg-muted/40 px-3 py-2 font-mono text-xs leading-5 text-foreground">
          <code>{command}</code>
        </pre>
      </CollapsibleContent>
    </Collapsible>
  )
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
          label="Searched for"
          detail={`“${activity.query}”`}
          separator="space"
          title={`Searched for “${activity.query}”`}
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
    if (isCommandAction(activity.action)) {
      return <CommandActivity activity={activity} />
    }

    const copy = processToolCopy(activity)
    const hasChanges =
      typeof activity.additions === "number" ||
      typeof activity.deletions === "number"

    return (
      <ActivityRow
        icon={<ToolIcon action={activity.action} />}
        label={copy.label}
        detail={
          copy.detail ? (
            <span className="font-mono text-xs">{copy.detail}</span>
          ) : undefined
        }
        separator="space"
        title={[copy.label, copy.detail].filter(Boolean).join(" ")}
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

  if (activity.kind === "child") {
    return (
      <ActivityRow
        icon={<WaypointsIcon />}
        label={
          activity.status === "in_progress"
            ? "Delegating a task"
            : "Delegated a task"
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

function ProcessActivityGroup({
  defaultOpen,
  item,
}: {
  defaultOpen: boolean
  item: Extract<ProcessActivityItem, { type: "group" }>
}) {
  const label = processActivityGroupLabel(item.family, item.activities)

  return (
    <Collapsible defaultOpen={defaultOpen} className="flex min-w-0 flex-col">
      <CollapsibleTrigger className="group/activity-group -ms-1 flex min-h-6 max-w-full min-w-0 items-center gap-2 rounded-md px-1 text-start leading-5 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background data-[panel-open]:[&_.activity-group-chevron]:rotate-90">
        <ActivityIcon>
          <GroupIcon family={item.family} />
        </ActivityIcon>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">
          {label}
        </span>
        <ChevronRightIcon
          aria-hidden="true"
          className="activity-group-chevron size-3.5 shrink-0 text-muted-foreground motion-safe:transition-transform"
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-1">
        <ol
          aria-label={`${label} details`}
          className="flex min-w-0 flex-col gap-1 ps-5.5"
        >
          {item.activities.map((activity) => (
            <li key={activity.id} className="min-w-0">
              <ProcessActivityRow activity={activity} />
            </li>
          ))}
        </ol>
      </CollapsibleContent>
    </Collapsible>
  )
}

export function ProcessActivityList({
  activities,
  className,
  defaultGroupsOpen = false,
}: {
  activities: readonly ProcessActivity[]
  className?: string
  defaultGroupsOpen?: boolean
}) {
  const items = groupProcessActivities(activities)

  return (
    <ol
      aria-label="Process activity"
      className={cn("flex min-w-0 flex-col gap-1", className)}
    >
      {items.map((item) => (
        <li
          key={item.type === "group" ? item.id : item.activity.id}
          className="min-w-0"
        >
          {item.type === "group" ? (
            <ProcessActivityGroup defaultOpen={defaultGroupsOpen} item={item} />
          ) : (
            <ProcessActivityRow activity={item.activity} />
          )}
        </li>
      ))}
    </ol>
  )
}
