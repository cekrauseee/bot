import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { BrowserPictureInPicture } from "@/features/conversation/components/browser-picture-in-picture"

const frame = {
  base64: "cG5n",
  capturedAt: "2026-09-03T00:00:00Z",
  mimeType: "image/png" as const,
}

describe("browser picture-in-picture", () => {
  it.each(["launching", "live", "awaiting_user"] as const)(
    "renders an accessible preview while browser is %s",
    (state) => {
      const markup = renderToStaticMarkup(
        React.createElement(BrowserPictureInPicture, {
          frame,
          projection: { control: "agent", state },
        })
      )

      expect(markup).toContain('aria-label="Browser preview"')
      expect(markup).toContain('alt="Current browser page"')
      expect(markup).toContain('src="data:image/png;base64,cG5n"')
    }
  )

  it.each(["stopped", "failed"] as const)(
    "renders nothing when browser is %s",
    (state) => {
      expect(
        renderToStaticMarkup(
          React.createElement(BrowserPictureInPicture, {
            frame,
            projection: { control: "agent", state },
          })
        )
      ).toBe("")
    }
  )

  it("renders nothing without a frame", () => {
    expect(
      renderToStaticMarkup(
        React.createElement(BrowserPictureInPicture, {
          projection: { control: "agent", state: "live" },
        })
      )
    ).toBe("")
  })
})
