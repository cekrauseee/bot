import { describe, expect, it } from "vitest"

import type { ConversationSummary } from "@/features/app-shell/api"
import {
  mergeConversationCatalog,
  mergeConversationTitle,
} from "@/features/app-shell/conversation-metadata"

function conversation(
  title: string,
  titleUpdatedAt: string | null
): ConversationSummary {
  return {
    id: "conversation-id",
    title,
    project_id: null,
    pinned_order: null,
    pin_updated_at: null,
    title_updated_at: titleUpdatedAt,
    created_at: "2026-09-02T10:00:00.000Z",
    updated_at: "2026-09-02T10:00:00.000Z",
  }
}

describe("conversation title metadata", () => {
  it("preserves a newer live title against a stale HTTP snapshot", () => {
    const current = conversation("Generated title", "2026-09-02T10:00:02.000Z")
    const stale = {
      ...conversation("Original prompt", null),
      project_id: "project-id",
    }

    expect(mergeConversationTitle(current, stale)).toEqual({
      ...stale,
      title: current.title,
      title_updated_at: current.title_updated_at,
    })
  })

  it("accepts a title with an equal or newer metadata clock", () => {
    const current = conversation("Generated title", "2026-09-02T10:00:02.000Z")
    const renamed = conversation("Renamed title", "2026-09-02T10:00:03.000Z")

    expect(mergeConversationTitle(current, renamed)).toBe(renamed)
  })

  it("merges catalog responses without resurrecting missing conversations", () => {
    const current = [
      conversation("Generated title", "2026-09-02T10:00:02.000Z"),
      { ...conversation("Deleted", null), id: "deleted-id" },
    ]
    const incoming = [conversation("Original prompt", null)]

    expect(mergeConversationCatalog(current, incoming)).toEqual([
      {
        ...incoming[0],
        title: "Generated title",
        title_updated_at: "2026-09-02T10:00:02.000Z",
      },
    ])
  })
})
