import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { ResponseProcess } from "@/features/conversation/components/response-process"

describe("response process", () => {
  it("renders processing while a response is active without activities", () => {
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

  it("keeps the completed duration for a direct response", () => {
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

  it("renders consecutive tool activity as a human-readable disclosure", () => {
    const markup = renderToStaticMarkup(
      React.createElement(ResponseProcess, {
        hasResponse: false,
        process: {
          activities: [
            {
              action: "filesystem_read",
              id: "read-1",
              status: "in_progress",
              target: "/workspace/package.json",
              type: "tool",
            },
            {
              action: "filesystem_read",
              id: "read-2",
              status: "completed",
              target: "/workspace/src/app.ts",
              type: "tool",
            },
          ],
          durationSeconds: 4,
          status: "processing",
        },
      })
    )

    expect(markup).toContain("Reading files")
    expect(markup).toContain('title="Reading package.json"')
    expect(markup).toContain('title="Read src/app.ts"')
    expect(markup).not.toContain("filesystem_read")
  })

  it("renders executed commands as nested code disclosures", () => {
    const markup = renderToStaticMarkup(
      React.createElement(ResponseProcess, {
        hasResponse: false,
        process: {
          activities: [
            {
              action: "shell_exec",
              id: "command-1",
              status: "completed",
              target: "npm run test --workspace=@my-bot/api -- seed.test.ts",
              type: "tool",
            },
            {
              action: "shell_exec",
              id: "command-2",
              status: "completed",
              target: "git diff --check",
              type: "tool",
            },
          ],
          durationSeconds: 12,
          status: "processing",
        },
      })
    )

    expect(markup).toContain("Ran commands")
    expect(markup).toContain("Ran</span>")
    expect(markup).toContain("<code>git diff --check</code>")
    expect(markup).toContain('aria-expanded="false"')
    expect(markup).not.toContain("shell_exec")
  })
})
