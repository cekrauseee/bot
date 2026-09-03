import { describe, expect, it } from "vitest"

import type { ProcessActivity } from "@/features/conversation/model"
import {
  groupProcessActivities,
  isProcessActivityActive,
  isProcessFamilyDefaultOpen,
  processActivityGroupLabel,
  processSearchCopy,
  processSkillCopy,
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

    expect(read).toEqual({ label: "Read", detail: "package.json" })
    expect(unknown).toEqual({ label: "Used a tool" })
    expect(processActivityGroupLabel("files-read", [tool("a", "read")])).toBe(
      "Read files"
    )
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
