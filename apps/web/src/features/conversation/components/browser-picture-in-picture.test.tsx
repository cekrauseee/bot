import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { BrowserPictureInPicture } from "@/features/conversation/components/browser-picture-in-picture"

const frame = {
  base64: "cG5n",
  capturedAt: "2026-09-03T00:00:00Z",
  mimeType: "image/png" as const,
}
const containerRef = { current: null } as React.RefObject<HTMLElement | null>

describe("browser picture-in-picture", () => {
  it.each(["launching", "live", "awaiting_user"] as const)(
    "renders an accessible preview while browser is %s",
    (state) => {
      const markup = renderToStaticMarkup(
        React.createElement(BrowserPictureInPicture, {
          containerRef,
          frame,
          projection: { control: "agent", state },
        })
      )

      expect(markup).toContain('aria-label="Browser preview"')
      expect(markup).toContain('alt="Current browser page"')
      expect(markup).toContain('src="data:image/png;base64,cG5n"')
      expect(markup).toContain("gap-2 py-3")
      expect(markup).toContain("gap-2 py-0")
      expect(markup).toContain("absolute inset-0 z-10 overflow-hidden")
      expect(markup).toContain("touch-none")
      expect(markup).toContain('draggable="false"')
      expect(markup).toContain("translate3d(0px, 0px, 0)")
      expect(markup).toContain("visibility:hidden")
    }
  )

  it.each(["stopped", "failed"] as const)(
    "renders nothing when browser is %s",
    (state) => {
      expect(
        renderToStaticMarkup(
          React.createElement(BrowserPictureInPicture, {
            containerRef,
            frame,
            projection: { control: "agent", state },
          })
        )
      ).toBe("")
    }
  )

  it("renders a busy preview while the first frame is pending", () => {
    const markup = renderToStaticMarkup(
      React.createElement(BrowserPictureInPicture, {
        containerRef,
        projection: { control: "agent", state: "live" },
      })
    )

    expect(markup).toContain('aria-label="Browser preview"')
    expect(markup).toContain('aria-busy="true"')
    expect(markup).not.toContain("<img")
  })
})
