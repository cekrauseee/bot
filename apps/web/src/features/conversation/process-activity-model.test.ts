import { describe, expect, it } from "vitest"

import type { ProcessActivity } from "@/features/conversation/model"
import {
  groupProcessActivities,
  processActivityGroupLabel,
  processToolCopy,
} from "@/features/conversation/process-activity-model"

const tool = (
  id: string,
  action: string,
  target?: string
): ProcessActivity => ({ id, action, target, type: "tool" })

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
})
