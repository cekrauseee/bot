import { describe, expect, it } from "vitest"

import type { ProcessActivity } from "@/features/conversation/model"
import {
  groupProcessActivities,
  isProcessActivityActive,
  isProcessFamilyDefaultOpen,
  processActivityGroupLabel,
  processChildCopy,
  processSearchCopy,
  processSkillCopy,
  processSkillName,
  processToolCopy,
} from "@/features/conversation/process-activity-model"

const tool = (
  id: string,
  action: string,
  target?: string
): Extract<ProcessActivity, { type: "tool" }> => ({
  id,
  action,
  target,
  type: "tool",
})

describe("process activity model", () => {
  it("groups only consecutive activities from the same family", () => {
    const items = groupProcessActivities([
      tool("read-1", "filesystem_read", "/workspace/a.ts"),
      tool("read-2", "filesystem_read", "/workspace/b.ts"),
      { content: "Checked the result.", id: "reasoning", type: "text" },
      tool("read-3", "filesystem_read", "/workspace/c.ts"),
      tool("browser-1", "browser_open", "https://example.com"),
      tool("browser-2", "browser_snapshot"),
      tool("browser-3", "browser_click"),
    ])

    expect(items.map((item) => item.type)).toEqual([
      "group",
      "activity",
      "activity",
      "group",
    ])
    expect(items[0]).toMatchObject({ family: "files-read" })
    expect(items[3]).toMatchObject({ family: "browser" })
  })

  it("keeps a search with results as a collapsible family item", () => {
    const items = groupProcessActivities([
      {
        id: "search-1",
        query: "AI workspace competitors",
        results: [{ id: "result-1", title: "Example" }],
        type: "search",
      },
    ])

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ family: "web-search", type: "group" })
  })

  it("centralizes active state, search copy, and family disclosure defaults", () => {
    expect(
      isProcessActivityActive({
        action: "filesystem_read",
        id: "read",
        status: "in_progress",
        type: "tool",
      })
    ).toBe(true)
    expect(
      isProcessActivityActive({
        content: "Thinking",
        id: "reasoning",
        type: "text",
      })
    ).toBe(false)
    expect(
      processSearchCopy({
        id: "search",
        query: "AI workspace competitors",
        status: "in_progress",
        type: "search",
      })
    ).toMatchObject({
      label: "Searching for “AI workspace competitors”",
      verb: "Searching for",
    })
    expect(isProcessFamilyDefaultOpen("browser", true)).toBe(false)
    expect(isProcessFamilyDefaultOpen("web-search", true)).toBe(false)
    expect(isProcessFamilyDefaultOpen("commands", true)).toBe(true)
    expect(
      processSearchCopy({
        id: "failed-search",
        query: "unavailable source",
        status: "failed",
        type: "search",
      })
    ).toMatchObject({
      label: "Could not search for “unavailable source”",
      verb: "Could not search for",
    })
  })

  it("uses sentence copy without exposing internal tool identifiers", () => {
    const read = processToolCopy({
      action: "filesystem_read",
      id: "read",
      status: "completed",
      target: "/workspace/package.json",
      type: "tool",
    })
    const unknown = processToolCopy({
      action: "internal_provider_tool",
      id: "unknown",
      status: "completed",
      target: "internal_provider_tool",
      type: "tool",
    })
    const custom = processToolCopy({
      action: "index_documents",
      id: "custom",
      label: "Indexed documents",
      status: "completed",
      type: "tool",
    })

    expect(read).toEqual({ label: "Read", detail: "package.json" })
    expect(unknown).toEqual({ label: "Used a tool" })
    expect(custom).toEqual({ label: "Indexed documents" })
    expect(processActivityGroupLabel("files-read", [tool("a", "read")])).toBe(
      "Read files"
    )
  })

  it("has specific copy for every visible agent tool", () => {
    const actions = [
      "browser_click",
      "browser_close",
      "browser_open",
      "browser_press",
      "browser_snapshot",
      "browser_type",
      "filesystem_list",
      "filesystem_read",
      "filesystem_write",
      "get_file_contents",
      "load_skill",
      "search_repositories",
      "shell_exec",
    ]
    const generic = new Set([
      "Using a tool",
      "Used a tool",
      "Could not use a tool",
    ])

    for (const action of actions) {
      for (const status of ["in_progress", "completed", "failed"] as const) {
        expect(
          generic.has(
            processToolCopy({ action, id: action, status, type: "tool" }).label
          )
        ).toBe(false)
      }
    }
    expect(
      processToolCopy({
        action: "browser_press",
        id: "press",
        status: "completed",
        target: "Escape",
        type: "tool",
      })
    ).toEqual({ label: "Pressed a key", detail: "Escape" })
  })

  it("uses truthful copy for child-agent lifecycle states", () => {
    expect(
      processChildCopy({
        detail: "Compare the release options",
        id: "child-start",
        kind: "child",
        label: "Delegating a task",
        status: "in_progress",
        type: "trace",
      })
    ).toEqual({
      label: "Delegating a task",
      detail: "Compare the release options",
    })
    expect(
      processChildCopy({
        id: "child-failed",
        kind: "child",
        label: "Could not delegate the task",
        status: "failed",
        type: "trace",
      })
    ).toEqual({ label: "Could not delegate a task", detail: undefined })
  })

  it("groups skill lifecycle items and gives them human-readable copy", () => {
    const activities: ProcessActivity[] = [
      { id: "s1", name: "calendar", status: "in_progress", type: "skill" },
      { id: "s2", name: "weather", status: "completed", type: "skill" },
    ]
    expect(groupProcessActivities(activities)[0]).toMatchObject({
      family: "skills",
      type: "group",
    })
    expect(
      processSkillCopy(
        activities[0] as Extract<ProcessActivity, { type: "skill" }>
      )
    ).toEqual({
      label: "Loading skill",
      detail: undefined,
    })
    expect(processActivityGroupLabel("skills", activities)).toBe(
      "Loaded skills"
    )
    expect(
      processActivityGroupLabel("skills", [
        { id: "s3", name: "calendar", status: "in_progress", type: "skill" },
      ])
    ).toBe("Loading skills")
    expect(processSkillName("github")).toBe("GitHub")
    expect(processSkillName("calendar")).toBe("calendar")
  })

  it("hides the generic load wrapper when skill lifecycle activity exists", () => {
    const items = groupProcessActivities([
      tool("load-github", "load_skill"),
      { id: "github", name: "github", status: "completed", type: "skill" },
    ])

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      activity: { id: "github", type: "skill" },
      type: "activity",
    })
    expect(
      processToolCopy({
        action: "load_skill",
        id: "load-calendar",
        status: "completed",
        type: "tool",
      })
    ).toEqual({ label: "Loaded skill" })
  })

  it("groups GitHub MCP calls with specific read-only copy", () => {
    const search = tool(
      "github-search",
      "search_repositories",
      "org:acme workspace launch"
    )
    const read = tool(
      "github-read",
      "get_file_contents",
      "acme/atlas/product/launch-brief.md @ refs/heads/main"
    )
    const items = groupProcessActivities([search, read])

    expect(items[0]).toMatchObject({ family: "github", type: "group" })
    expect(processToolCopy({ ...search, status: "in_progress" })).toEqual({
      label: "Searching repositories",
      detail: "org:acme workspace launch",
    })
    expect(processToolCopy({ ...read, status: "completed" })).toEqual({
      label: "Read from GitHub",
      detail: "acme/atlas/product/launch-brief.md @ refs/heads/main",
    })
    expect(processActivityGroupLabel("github", [search, read])).toBe(
      "Worked in GitHub"
    )
  })

  it("shows a safe failure detail for a failed tool", () => {
    expect(
      processToolCopy({
        action: "browser_click",
        detail: "The browser action could not be completed.",
        id: "click",
        status: "failed",
        type: "tool",
      })
    ).toEqual({
      label: "Could not interact with the page",
      detail: "The browser action could not be completed.",
    })
  })

  it("uses the latest browser child status after a recovered failure", () => {
    const activities: ProcessActivity[] = [
      { ...tool("click-1", "browser_click"), status: "failed" },
      { ...tool("snapshot-2", "browser_snapshot"), status: "completed" },
    ]

    expect(processActivityGroupLabel("browser", activities)).toBe(
      "Worked in the browser"
    )
  })

  it("uses the current browser action while it is in progress", () => {
    const activities: ProcessActivity[] = [
      { ...tool("open-1", "browser_open"), status: "completed" },
      { ...tool("click-2", "browser_click"), status: "in_progress" },
    ]

    expect(processActivityGroupLabel("browser", activities)).toBe(
      "Interacting with the page"
    )
  })
})
