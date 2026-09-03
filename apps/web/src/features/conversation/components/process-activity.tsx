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
  type LucideIcon,
} from "lucide-react"
import type { ReactNode } from "react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import type {
  BrowserProjection,
  ProcessActivity,
  ProcessSearchSource,
} from "@/features/conversation/model"
import {
  groupProcessActivities,
  isProcessActivityActive,
  isBrowserProcessActive,
  isProcessCommandAction,
  isProcessFamilyDefaultOpen,
  isSingleSearchGroup,
  normalizeProcessAction,
  processActivityGroupLabel,
  processSearchCopy,
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
  active = false,
  detail,
  icon,
  label,
  separator = "dot",
  title,
  trailing,
}: {
  active?: boolean
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
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-muted-foreground",
          active && "shimmer"
        )}
      >
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

const TOOL_ICON_RULES: readonly {
  actions?: readonly string[]
  icon: LucideIcon
  prefix?: string
}[] = [
  {
    actions: ["filesystem_list", "filesystem_read", "list", "read"],
    icon: FileTextIcon,
  },
  {
    actions: ["edit", "filesystem_write", "updated", "write"],
    icon: PencilLineIcon,
  },
  { actions: ["executed", "run", "shell_exec"], icon: SquareTerminalIcon },
  { icon: Globe2Icon, prefix: "browser_" },
]

const GROUP_ICONS: Record<ProcessActivityFamily, LucideIcon> = {
  browser: Globe2Icon,
  commands: SquareTerminalIcon,
  "files-inspected": FileTextIcon,
  "files-read": FileTextIcon,
  "files-updated": PencilLineIcon,
  "web-search": SearchIcon,
}

const TRACE_ICONS: Record<string, LucideIcon> = {
  message: MessageSquareIcon,
  read: FileTextIcon,
  request: MessageSquareIcon,
  run: SquareTerminalIcon,
  write: PencilLineIcon,
}

function ToolIcon({ action }: { action: string }) {
  const normalized = normalizeProcessAction(action)
  const matchingRule = TOOL_ICON_RULES.find(
    ({ actions, prefix }) =>
      actions?.includes(normalized) ||
      (prefix !== undefined && normalized.startsWith(prefix))
  )
  const Icon = matchingRule?.icon ?? WrenchIcon
  return <Icon />
}

function GroupIcon({ family }: { family: ProcessActivityFamily }) {
  const Icon = GROUP_ICONS[family]
  return <Icon />
}

function TraceIcon({ kind }: { kind: string }) {
  const Icon = TRACE_ICONS[kind] ?? WaypointsIcon
  return <Icon />
}

function SearchActivityResults({
  results,
}: {
  results?: readonly ProcessSearchSource[]
}) {
  if (!results?.length) return null

  return (
    <div className="flex min-w-0 flex-col gap-2 ps-5.5">
      {results.map((result) => {
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
            title={[result.title, result.domain].filter(Boolean).join(" · ")}
            className="flex min-h-6 min-w-0 items-center gap-2 rounded-md outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          >
            {content}
          </a>
        ) : (
          <div
            key={result.id}
            title={[result.title, result.domain].filter(Boolean).join(" · ")}
            className="flex min-h-6 min-w-0 items-center gap-2"
          >
            {content}
          </div>
        )
      })}
    </div>
  )
}

function SearchActivityRow({
  activity,
  showLabel = true,
}: {
  activity: Extract<ProcessActivity, { type: "search" }>
  showLabel?: boolean
}) {
  const copy = processSearchCopy(activity)

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {showLabel ? (
        <ActivityRow
          icon={<SearchIcon />}
          label={copy.verb}
          detail={copy.query}
          active={isProcessActivityActive(activity)}
          separator="space"
          title={copy.label}
          trailing={
            activity.moreCount ? (
              <span className="text-muted-foreground">
                +{activity.moreCount} more
              </span>
            ) : undefined
          }
        />
      ) : null}
      <SearchActivityResults results={activity.results} />
    </div>
  )
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
        active={isProcessActivityActive(activity)}
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
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 text-muted-foreground",
            isProcessActivityActive(activity) && "shimmer"
          )}
        >
          <span>{copy.label}</span>
          <ChevronRightIcon
            aria-hidden="true"
            className="command-chevron size-3.5 shrink-0 motion-safe:transition-transform"
          />
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
          {summary}
        </span>
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
        active={isProcessActivityActive(activity)}
        title={[activity.label, activity.meta].filter(Boolean).join(" · ")}
      />
    )
  }

  if (activity.type === "search") {
    return <SearchActivityRow activity={activity} />
  }

  if (activity.type === "tool") {
    if (isProcessCommandAction(activity.action)) {
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
        active={isProcessActivityActive(activity)}
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
    const taskLabel =
      activity.label === "Delegated a task" ? "a task" : activity.label
    return (
      <ActivityRow
        icon={<WaypointsIcon />}
        label={
          activity.status === "in_progress"
            ? `Delegating ${taskLabel}`
            : `Delegated ${taskLabel}`
        }
        detail={activity.detail}
        active={isProcessActivityActive(activity)}
        title={[activity.label, activity.detail].filter(Boolean).join(" · ")}
      />
    )
  }

  return (
    <ActivityRow
      icon={<TraceIcon kind={activity.kind} />}
      label={activity.label}
      detail={activity.detail}
      active={isProcessActivityActive(activity)}
      title={[activity.label, activity.detail].filter(Boolean).join(" · ")}
    />
  )
}

function ProcessActivityGroup({
  browserActive,
  defaultOpen,
  item,
}: {
  browserActive: boolean
  defaultOpen: boolean
  item: Extract<ProcessActivityItem, { type: "group" }>
}) {
  const label = processActivityGroupLabel(
    item.family,
    item.activities,
    browserActive
  )
  const last = item.activities.at(-1)
  const active =
    browserActive || (last !== undefined && isProcessActivityActive(last))
  const singleSearch = isSingleSearchGroup(item)

  return (
    <Collapsible
      defaultOpen={isProcessFamilyDefaultOpen(item.family, defaultOpen)}
      className="flex min-w-0 flex-col"
    >
      <CollapsibleTrigger className="group/activity-group -ms-1 flex min-h-6 max-w-full min-w-0 items-center gap-2 rounded-md px-1 text-start leading-5 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background data-[panel-open]:[&_.activity-group-chevron]:rotate-90">
        <ActivityIcon>
          <GroupIcon family={item.family} />
        </ActivityIcon>
        <span className="inline-flex max-w-full min-w-0 items-center gap-1.5">
          <span
            className={cn(
              "min-w-0 truncate text-muted-foreground",
              active && "shimmer"
            )}
          >
            {label}
          </span>
          <ChevronRightIcon
            aria-hidden="true"
            className="activity-group-chevron size-3.5 shrink-0 text-muted-foreground motion-safe:transition-transform"
          />
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-1">
        <ol
          aria-label={`${label} details`}
          className="flex min-w-0 flex-col gap-1 ps-5.5"
        >
          {item.activities.map((activity) => (
            <li key={activity.id} className="min-w-0">
              {singleSearch && activity.type === "search" ? (
                <SearchActivityRow activity={activity} showLabel={false} />
              ) : (
                <ProcessActivityRow activity={activity} />
              )}
            </li>
          ))}
        </ol>
      </CollapsibleContent>
    </Collapsible>
  )
}

export function ProcessActivityList({
  activities,
  browserProjection,
  className,
  defaultGroupsOpen = false,
}: {
  activities: readonly ProcessActivity[]
  browserProjection?: BrowserProjection | null
  className?: string
  defaultGroupsOpen?: boolean
}) {
  const items = groupProcessActivities(activities)
  const browserActive = isBrowserProcessActive(browserProjection)

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
            <ProcessActivityGroup
              browserActive={browserActive && item.family === "browser"}
              defaultOpen={defaultGroupsOpen}
              item={item}
            />
          ) : (
            <ProcessActivityRow activity={item.activity} />
          )}
        </li>
      ))}
    </ol>
  )
}
