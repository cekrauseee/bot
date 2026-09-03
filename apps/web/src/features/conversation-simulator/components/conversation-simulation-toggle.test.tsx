import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { ConversationSimulationToggle } from "@/features/conversation-simulator/components/conversation-simulation-toggle"

describe("conversation simulation toggle", () => {
  it("has a human-readable label and exposes its checked state", () => {
    const markup = renderToStaticMarkup(
      React.createElement(ConversationSimulationToggle, {
        checked: true,
        onCheckedChange: () => undefined,
      })
    )

    expect(markup).toContain("Simulate conversation")
    expect(markup).toContain('role="switch"')
    expect(markup).toContain('aria-checked="true"')
  })
})
