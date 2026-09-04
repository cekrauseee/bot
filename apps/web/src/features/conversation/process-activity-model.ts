import type {
  BrowserProjection,
  ProcessActivity,
  ProcessActivityStatus,
} from "@/features/conversation/model"

export type ProcessActivityFamily =
  | "browser"
  | "commands"
  | "files-inspected"
  | "files-read"
  | "files-updated"
  | "web-search"
  | "skills"

export type ProcessActivityItem =
  | { activity: ProcessActivity; type: "activity" }
  | {
      activities: readonly ProcessActivity[]
      family: ProcessActivityFamily
      id: string
      type: "group"
    }

const COMMAND_ACTIONS = new Set(["executed", "run", "shell_exec"])
const COLLAPSED_FAMILIES = new Set<ProcessActivityFamily>([
  "browser",
  "web-search",
])
const BROWSER_ACTIVE_STATES = new Set(["launching", "live", "awaiting_user"])
const TOOL_FAMILY_RULES: readonly {
  actions?: readonly string[]
  family: ProcessActivityFamily
  prefix?: string
}[] = [
  { family: "browser", prefix: "browser_" },
  {
    actions: ["filesystem_list", "list"],
    family: "files-inspected",
  },
  {
    actions: ["filesystem_read", "read"],
    family: "files-read",
  },
  {
    actions: ["filesystem_write", "edit", "updated", "write"],
    family: "files-updated",
  },
  {
    actions: ["executed", "run", "shell_exec"],
    family: "commands",
  },
]
const GROUP_LABELS: Record<ProcessActivityFamily, [string, string, string]> = {
  browser: [
    "Working in the browser",
    "Worked in the browser",
    "Had trouble in the browser",
  ],
  commands: [
    "Running commands",
    "Ran commands",
    "Had trouble running commands",
  ],
  "files-inspected": [
    "Inspecting files",
    "Inspected files",
    "Had trouble inspecting files",
  ],
  "files-read": ["Reading files", "Read files", "Had trouble reading files"],
  "files-updated": [
    "Updating files",
    "Updated files",
    "Had trouble updating files",
  ],
  "web-search": [
    "Searching the web",
    "Searched the web",
    "Had trouble searching the web",
  ],
  skills: ["Loading skills", "Loaded skills", "Could not load skills"],
}

export function normalizeProcessAction(action: string) {
  return action
    .trim()
    .toLowerCase()
    .replace(/[.\s-]+/g, "_")
}

export function isProcessActivityActive(activity: ProcessActivity) {
  if (activity.type === "step") return activity.status === "active"
  if (activity.type === "text") return false
  return activity.status === "in_progress"
}

export function isBrowserProcessActive(projection?: BrowserProjection | null) {
  return BROWSER_ACTIVE_STATES.has(projection?.state ?? "")
}

export function isProcessCommandAction(action: string) {
  return COMMAND_ACTIONS.has(normalizeProcessAction(action))
}

export function isProcessFamilyDefaultOpen(
  family: ProcessActivityFamily,
  defaultOpen: boolean
) {
  return COLLAPSED_FAMILIES.has(family) ? false : defaultOpen
}

export function isSingleSearchGroup(
  item: Extract<ProcessActivityItem, { type: "group" }>
) {
  return (
    item.family === "web-search" &&
    item.activities.length === 1 &&
    item.activities[0]?.type === "search"
  )
}

export function processSearchCopy(
  activity: Extract<ProcessActivity, { type: "search" }>
) {
  const verb =
    activity.status === "in_progress" ? "Searching for" : "Searched for"
  const query = `“${activity.query}”`
  return {
    label: `${verb} ${query}`,
    query,
    verb,
  }
}

const statusLabel = (
  status: ProcessActivityStatus | undefined,
  pending: string,
  completed: string,
  failed: string
) =>
  status === "in_progress" ? pending : status === "failed" ? failed : completed

const workspaceTarget = (target?: string) => {
  if (!target) return undefined
  if (target === "/workspace") return "the workspace"
  return target.startsWith("/workspace/") ? target.slice(11) : target
}

const browserTarget = (target?: string) => {
  if (!target) return undefined
  try {
    const url = new URL(target)
    return `${url.host}${url.pathname === "/" ? "" : url.pathname}`
  } catch {
    return undefined
  }
}

type ProcessTool = Extract<ProcessActivity, { type: "tool" }>
type ToolCopyContext = {
  activity: ProcessTool
  failureDetail?: string
  file?: string
}
type ToolCopyDefinition = {
  detail: (context: ToolCopyContext) => string | undefined
  labels: [string, string, string]
}

const defineToolCopy = (
  labels: [string, string, string],
  detail: ToolCopyDefinition["detail"]
): ToolCopyDefinition => ({ detail, labels })

const failureDetail = ({ failureDetail }: ToolCopyContext) => failureDetail
const fileDetail = ({ failureDetail, file }: ToolCopyContext) =>
  failureDetail ?? file
const targetDetail = ({ activity, failureDetail }: ToolCopyContext) =>
  failureDetail ?? activity.target
const browserDetail = ({ activity, failureDetail }: ToolCopyContext) =>
  failureDetail ?? browserTarget(activity.target) ?? "the browser"

const TOOL_COPY_DEFINITIONS: Record<string, ToolCopyDefinition> = {
  edit: defineToolCopy(["Updating", "Updated", "Could not update"], fileDetail),
  executed: defineToolCopy(["Running", "Ran", "Could not run"], targetDetail),
  filesystem_list: defineToolCopy(
    ["Inspecting", "Inspected", "Could not inspect"],
    fileDetail
  ),
  filesystem_read: defineToolCopy(
    ["Reading", "Read", "Could not read"],
    fileDetail
  ),
  filesystem_write: defineToolCopy(
    ["Updating", "Updated", "Could not update"],
    fileDetail
  ),
  list: defineToolCopy(
    ["Inspecting", "Inspected", "Could not inspect"],
    fileDetail
  ),
  read: defineToolCopy(["Reading", "Read", "Could not read"], fileDetail),
  run: defineToolCopy(["Running", "Ran", "Could not run"], targetDetail),
  shell_exec: defineToolCopy(["Running", "Ran", "Could not run"], targetDetail),
  updated: defineToolCopy(
    ["Updating", "Updated", "Could not update"],
    fileDetail
  ),
  write: defineToolCopy(
    ["Updating", "Updated", "Could not update"],
    fileDetail
  ),
  browser_click: defineToolCopy(
    [
      "Interacting with the page",
      "Interacted with the page",
      "Could not interact with the page",
    ],
    failureDetail
  ),
  browser_close: defineToolCopy(
    [
      "Closing the browser",
      "Closed the browser",
      "Could not close the browser",
    ],
    failureDetail
  ),
  browser_open: defineToolCopy(
    ["Opening", "Opened", "Could not open"],
    browserDetail
  ),
  browser_press: defineToolCopy(
    ["Submitting the page", "Submitted the page", "Could not submit the page"],
    failureDetail
  ),
  browser_snapshot: defineToolCopy(
    ["Inspecting the page", "Inspected the page", "Could not inspect the page"],
    failureDetail
  ),
  browser_type: defineToolCopy(
    [
      "Entering text on the page",
      "Entered text on the page",
      "Could not enter text on the page",
    ],
    failureDetail
  ),
}

const DEFAULT_TOOL_COPY = defineToolCopy(
  ["Using a tool", "Used a tool", "Could not use a tool"],
  failureDetail
)

export function processToolCopy(activity: ProcessTool) {
  const action = normalizeProcessAction(activity.action)
  const copy = TOOL_COPY_DEFINITIONS[action] ?? DEFAULT_TOOL_COPY
  const detail = activity.status === "failed" ? activity.detail : undefined
  return {
    label: statusLabel(activity.status, ...copy.labels),
    detail: copy.detail({
      activity,
      failureDetail: detail,
      file: workspaceTarget(activity.target),
    }),
  }
}

export function processSkillCopy(
  activity: Extract<ProcessActivity, { type: "skill" }>
) {
  const pending = "Loading skill"
  const completed = "Loaded skill"
  const failed = "Could not load skill"
  return {
    label: statusLabel(activity.status, pending, completed, failed),
    detail: activity.detail,
  }
}

export function processActivityFamily(
  activity: ProcessActivity
): ProcessActivityFamily | null {
  if (activity.type === "search") return "web-search"
  if (activity.type === "skill") return "skills"
  if (activity.type !== "tool") return null

  const action = normalizeProcessAction(activity.action)
  const rule = TOOL_FAMILY_RULES.find(
    ({ actions, prefix }) =>
      actions?.includes(action) ||
      (prefix !== undefined && action.startsWith(prefix))
  )
  return rule?.family ?? null
}

export function groupProcessActivities(
  activities: readonly ProcessActivity[]
): ProcessActivityItem[] {
  const items: ProcessActivityItem[] = []

  for (let index = 0; index < activities.length;) {
    const activity = activities[index]
    const family = processActivityFamily(activity)
    if (!family) {
      items.push({ activity, type: "activity" })
      index += 1
      continue
    }

    let end = index + 1
    while (
      end < activities.length &&
      processActivityFamily(activities[end]) === family
    ) {
      end += 1
    }
    const grouped = activities.slice(index, end)
    const shouldGroupSearch =
      family === "web-search" &&
      activity.type === "search" &&
      Boolean(activity.results?.length)
    if (grouped.length === 1 && !shouldGroupSearch) {
      items.push({ activity, type: "activity" })
    } else {
      items.push({
        activities: grouped,
        family,
        id: `group:${family}:${activity.id}`,
        type: "group",
      })
    }
    index = end
  }

  return items
}

export function processActivityGroupLabel(
  family: ProcessActivityFamily,
  activities: readonly ProcessActivity[],
  browserActive = false
) {
  const first = activities[0]
  if (
    family === "web-search" &&
    activities.length === 1 &&
    first?.type === "search"
  ) {
    return processSearchCopy(first).label
  }

  // Tool calls are sequential from the agent's perspective. The latest
  // status is therefore the source of truth for the current group state;
  // historical failures remain visible in the child rows but must not poison
  // a later successful retry.
  const latest = [...activities]
    .reverse()
    .find(
      (
        activity
      ): activity is Extract<
        ProcessActivity,
        { type: "tool" | "search" | "skill" | "trace" }
      > =>
        (activity.type === "tool" ||
          activity.type === "search" ||
          activity.type === "skill" ||
          activity.type === "trace") &&
        Boolean(activity.status)
    )
  const active =
    browserActive || (latest !== undefined && latest.status === "in_progress")
  const failed = latest !== undefined && latest.status === "failed"
  const [pending, completed, error] = GROUP_LABELS[family]
  if (
    active &&
    family === "browser" &&
    latest?.type === "tool" &&
    latest.status === "in_progress"
  ) {
    return processToolCopy(latest).label
  }
  return active ? pending : failed ? error : completed
}
