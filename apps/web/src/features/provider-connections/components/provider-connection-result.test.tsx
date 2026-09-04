import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import {
  ProviderConnectionResultCard,
  ProviderConnectionSuccessAlert,
} from "@/features/provider-connections/components/provider-connection-result"

describe("provider connection result", () => {
  it.each([
    ["connected", "GitHub connected", "You can close this window."],
    ["error", "Unable to connect GitHub", "Return to Bot and try again."],
  ] as const)(
    "renders an accessible %s result",
    (status, title, description) => {
      const markup = renderToStaticMarkup(
        <ProviderConnectionResultCard
          providerName="GitHub"
          status={status}
          action={{
            type: "button",
            onClick: () => undefined,
            label: "Close window",
          }}
        />
      )

      expect(markup).toContain(`<h1>${title}</h1>`)
      expect(markup).toContain(description)
      expect(markup).toContain("Close window")
      expect(markup).toContain('data-size="sm"')
      expect(markup).not.toContain("<svg")
    }
  )

  it("renders a dismissible polite success alert", () => {
    const markup = renderToStaticMarkup(
      <ProviderConnectionSuccessAlert
        providerName="ChatGPT"
        onDismiss={() => undefined}
      />
    )

    expect(markup).toContain('role="status"')
    expect(markup).toContain("ChatGPT connected")
    expect(markup).toContain('aria-label="Dismiss ChatGPT connection success"')
    expect(markup).toContain("hover:bg-success/15")
  })

  it("renders a desktop deep-link fallback as navigation", () => {
    const markup = renderToStaticMarkup(
      <ProviderConnectionResultCard
        providerName="GitHub"
        status="connected"
        desktopHandoff
        action={{
          type: "link",
          href: "mybot://connections/github/callback?status=connected",
          label: "Open Bot",
        }}
      />
    )

    expect(markup).toContain("Bot should open automatically.")
    expect(markup).toContain(
      'href="mybot://connections/github/callback?status=connected"'
    )
    expect(markup).toContain(">Open Bot</a>")
  })
})
