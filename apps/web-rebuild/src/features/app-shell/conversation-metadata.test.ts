import { describe, expect, it } from "vitest"

import type { ConversationSummary } from "@/features/app-shell/api"
import {
  mergeConversationCatalog,
  mergeConversationTitle,
  parseConversationSummary,
} from "@/features/app-shell/conversation-metadata"

function conversation(
  title: string,
  titleUpdatedAt: string | null
): ConversationSummary {
  return {
    id: "conversation-id",
    title,
    model: "gpt-5.6-sol",
    model_updated_at: "2026-09-02T10:00:00.000Z",
    project_id: null,
    pinned_order: null,
    pin_updated_at: null,
    title_updated_at: titleUpdatedAt,
    created_at: "2026-09-02T10:00:00.000Z",
    updated_at: "2026-09-02T10:00:00.000Z",
  }
}

describe("conversation title metadata", () => {
  it("requires and returns the backend-owned conversation model", () => {
    const summary = conversation("Conversation", null)
    const withoutModel: Record<string, unknown> = { ...summary }
    delete withoutModel.model

    expect(parseConversationSummary(summary)?.model).toBe("gpt-5.6-sol")
    expect(parseConversationSummary(withoutModel)).toBeNull()
  })

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

  it("preserves a newer conversation model against a stale catalog response", () => {
    const current = {
      ...conversation("Conversation", null),
      model: "gpt-5.6-terra",
      model_updated_at: "2026-09-02T10:00:03.000Z",
    }
    const stale = {
      ...conversation("Conversation", null),
      model: "gpt-5.6-sol",
      model_updated_at: "2026-09-02T10:00:02.000Z",
    }

    expect(mergeConversationTitle(current, stale)).toMatchObject({
      model: current.model,
      model_updated_at: current.model_updated_at,
    })
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
