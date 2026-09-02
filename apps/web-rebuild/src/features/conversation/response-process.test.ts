import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { ResponseProcess } from "@/features/conversation/components/response-process"

describe("response process", () => {
  it("renders step-free processing as static status without disclosure", () => {
    const markup = renderToStaticMarkup(
      React.createElement(ResponseProcess, {
        hasResponse: false,
        process: {
          activities: [],
          durationSeconds: 4,
          status: "processing",
        },
      })
    )

    expect(markup).toContain("Processing")
    expect(markup).toContain("shimmer")
    expect(markup).not.toContain('data-slot="collapsible-trigger"')
  })

  it("separates a step-free completed status from its response", () => {
    const markup = renderToStaticMarkup(
      React.createElement(ResponseProcess, {
        hasResponse: true,
        process: {
          activities: [],
          durationSeconds: 4,
          status: "processed",
        },
      })
    )

    expect(markup).toContain("Processed for 4s")
    expect(markup).toContain('data-slot="separator"')
    expect(markup).not.toContain('data-slot="collapsible-trigger"')
  })
})
