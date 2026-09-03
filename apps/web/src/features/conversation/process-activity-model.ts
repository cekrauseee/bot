import type {
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

export type ProcessActivityItem =
  | { activity: ProcessActivity; type: "activity" }
  | {
      activities: readonly ProcessActivity[]
      family: ProcessActivityFamily
      id: string
      type: "group"
    }

const normalizedAction = (action: string) =>
  action
    .trim()
    .toLowerCase()
    .replace(/[.\s-]+/g, "_")

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

export function processToolCopy(
  activity: Extract<ProcessActivity, { type: "tool" }>
) {
  const action = normalizedAction(activity.action)
  const file = workspaceTarget(activity.target)
  const failureDetail = activity.status === "failed" ? activity.detail : undefined

  if (["filesystem_list", "list"].includes(action)) {
    return {
      label: statusLabel(
        activity.status,
        "Inspecting",
        "Inspected",
        "Could not inspect"
      ),
      detail: failureDetail ?? file,
    }
  }
  if (["filesystem_read", "read"].includes(action)) {
    return {
      label: statusLabel(activity.status, "Reading", "Read", "Could not read"),
      detail: failureDetail ?? file,
    }
  }
  if (["filesystem_write", "edit", "updated", "write"].includes(action)) {
    return {
      label: statusLabel(
        activity.status,
        "Updating",
        "Updated",
        "Could not update"
      ),
      detail: failureDetail ?? file,
    }
  }
  if (["executed", "run", "shell_exec"].includes(action)) {
    return {
      label: statusLabel(activity.status, "Running", "Ran", "Could not run"),
      detail: failureDetail ?? activity.target,
    }
  }
  if (action === "browser_open") {
    return {
      label: statusLabel(
        activity.status,
        "Opening",
        "Opened",
        "Could not open"
      ),
      detail: failureDetail ?? browserTarget(activity.target) ?? "the browser",
    }
  }
  if (action === "browser_snapshot") {
    return {
      label: statusLabel(
        activity.status,
        "Inspecting the page",
        "Inspected the page",
        "Could not inspect the page"
      ),
      detail: failureDetail,
    }
  }
  if (action === "browser_click") {
    return {
      label: statusLabel(
        activity.status,
        "Interacting with the page",
        "Interacted with the page",
        "Could not interact with the page"
      ),
      detail: failureDetail,
    }
  }
  if (action === "browser_type") {
    return {
      label: statusLabel(
        activity.status,
        "Entering text on the page",
        "Entered text on the page",
        "Could not enter text on the page"
      ),
      detail: failureDetail,
    }
  }
  if (action === "browser_press") {
    return {
      label: statusLabel(
        activity.status,
        "Submitting the page",
        "Submitted the page",
        "Could not submit the page"
      ),
      detail: failureDetail,
    }
  }
  if (action === "browser_close") {
    return {
      label: statusLabel(
        activity.status,
        "Closing the browser",
        "Closed the browser",
        "Could not close the browser"
      ),
      detail: failureDetail,
    }
  }
  if (action === "ask_user") {
    return {
      label: statusLabel(
        activity.status,
        "Asking for input",
        "Asked for input",
        "Could not ask for input"
      ),
      detail: failureDetail,
    }
  }
  return {
    label: statusLabel(
      activity.status,
      "Using a tool",
      "Used a tool",
      "Could not use a tool"
    ),
    detail: failureDetail,
  }
}

export function processActivityFamily(
  activity: ProcessActivity
): ProcessActivityFamily | null {
  if (activity.type === "search") return "web-search"
  if (activity.type !== "tool") return null

  const action = normalizedAction(activity.action)
  if (action.startsWith("browser_")) return "browser"
  if (["filesystem_list", "list"].includes(action)) return "files-inspected"
  if (["filesystem_read", "read"].includes(action)) return "files-read"
  if (["filesystem_write", "edit", "updated", "write"].includes(action)) {
    return "files-updated"
  }
  if (["executed", "run", "shell_exec"].includes(action)) return "commands"
  return null
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
    if (grouped.length === 1) {
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
  activities: readonly ProcessActivity[]
) {
  const active = activities.some(
    (activity) => "status" in activity && activity.status === "in_progress"
  )
  const failed = activities.some(
    (activity) => "status" in activity && activity.status === "failed"
  )
  const labels: Record<ProcessActivityFamily, [string, string, string]> = {
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
  }
  const [pending, completed, error] = labels[family]
  return active ? pending : failed ? error : completed
}
