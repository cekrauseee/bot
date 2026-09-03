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
    expect(markup).toContain('data-slot="separator"')
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

  it("keeps processing static while activities are streaming", () => {
    const markup = renderToStaticMarkup(
      React.createElement(
        ResponseProcess,
        {
          hasResponse: true,
          process: {
            activities: [
              {
                content: "I am checking the current context.",
                id: "reason-1",
                type: "text",
              },
            ],
            durationSeconds: 4,
            status: "processing",
          },
        },
        React.createElement("p", null, "The response is still streaming.")
      )
    )

    expect(markup).toContain("Processing")
    expect(markup).toContain("I am checking the current context.")
    expect(markup).toContain("The response is still streaming.")
    expect(markup).toContain('data-slot="separator"')
    expect(markup).not.toContain('data-slot="collapsible-trigger"')
  })

  it("keeps the response visible while completed process details collapse below it", () => {
    const markup = renderToStaticMarkup(
      React.createElement(
        ResponseProcess,
        {
          hasResponse: true,
          process: {
            activities: [
              {
                action: "filesystem_read",
                id: "read-1",
                status: "completed",
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
            status: "processed",
          },
        },
        React.createElement("p", null, "The final response.")
      )
    )

    const separatorIndex = markup.indexOf('data-slot="separator"')
    const responseIndex = markup.indexOf("The final response.")

    expect(markup).toContain('data-slot="collapsible-trigger"')
    expect(markup).toContain('aria-expanded="false"')
    expect(separatorIndex).toBeGreaterThan(-1)
    expect(responseIndex).toBeGreaterThan(separatorIndex)
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

    expect(markup).toContain("Read files")
    expect(markup).toContain('title="Reading package.json"')
    expect(markup).toContain('title="Read src/app.ts"')
    expect(markup).not.toContain("filesystem_read")
  })

  it("renders a search with results as a collapsible family item", () => {
    const markup = renderToStaticMarkup(
      React.createElement(ResponseProcess, {
        hasResponse: false,
        process: {
          activities: [
            {
              id: "search-1",
              query: "AI workspace competitors pricing collaboration 2026",
              results: [
                {
                  domain: "notion.so",
                  id: "result-1",
                  title: "Workspace plans and pricing",
                },
                {
                  domain: "openai.com",
                  id: "result-2",
                  title: "AI assistant product overview",
                },
              ],
              status: "in_progress",
              type: "search",
            },
          ],
          durationSeconds: 4,
          status: "processing",
        },
      })
    )

    expect(markup).toContain(
      "Searching for “AI workspace competitors pricing collaboration 2026”"
    )
    expect(markup).toContain("activity-group-chevron")
    expect(markup).toContain('aria-expanded="false"')
    expect(markup).toContain("shimmer")
  })

  it("adds shimmer to an active individual process activity", () => {
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
          ],
          durationSeconds: 4,
          status: "processing",
        },
      })
    )

    expect(markup).toContain("Reading package.json")
    expect(markup).toContain("shimmer")
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

    expect(markup).toMatch(
      /<span class="inline-flex shrink-0 items-center gap-1\.5 text-muted-foreground"><span>Ran<\/span><svg[^>]*class="[^"]*command-chevron[^"]*"[^>]*>[\s\S]*?<span class="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">npm run test/
    )
  })

  it("starts browser groups collapsed while an action is active", () => {
    const markup = renderToStaticMarkup(
      React.createElement(ResponseProcess, {
        hasResponse: false,
        process: {
          activities: [
            {
              action: "browser_open",
              id: "browser-1",
              status: "in_progress",
              target: "https://example.com",
              type: "tool",
            },
            {
              action: "browser_snapshot",
              id: "browser-2",
              status: "in_progress",
              type: "tool",
            },
          ],
          durationSeconds: 2,
          status: "processing",
        },
      })
    )

    expect(markup).toContain("Inspecting the page")
    expect(markup).toContain('aria-expanded="false"')
    expect(markup).toContain("shimmer")
  })

  it("keeps a live browser session active between tool calls", () => {
    const markup = renderToStaticMarkup(
      React.createElement(ResponseProcess, {
        hasResponse: false,
        process: {
          activities: [
            {
              action: "browser_open",
              id: "browser-1",
              status: "completed",
              target: "https://example.com",
              type: "tool",
            },
            {
              action: "browser_click",
              id: "browser-2",
              status: "failed",
              type: "tool",
            },
          ],
          browserProjection: { control: "agent", state: "live" },
          durationSeconds: 2,
          status: "processing",
        },
      })
    )

    expect(markup).toContain("Working in the browser")
    expect(markup).toContain("shimmer")
    expect(markup).toContain('aria-expanded="false"')
  })

  it("shows the current browser operation while the session is live", () => {
    const markup = renderToStaticMarkup(
      React.createElement(ResponseProcess, {
        hasResponse: false,
        process: {
          activities: [
            {
              action: "browser_open",
              id: "browser-1",
              status: "completed",
              type: "tool",
            },
            {
              action: "browser_snapshot",
              id: "browser-2",
              status: "in_progress",
              type: "tool",
            },
          ],
          browserProjection: { control: "agent", state: "live" },
          durationSeconds: 2,
          status: "processing",
        },
      })
    )

    expect(markup).toContain("Inspecting the page")
    expect(markup).toContain("shimmer")
  })
})
