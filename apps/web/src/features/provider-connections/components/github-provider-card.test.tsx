import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { GithubProviderCard } from "@/features/provider-connections/components/github-provider-card"

describe("GitHub provider card", () => {
  it("matches the compact card spacing used by the model provider", () => {
    const markup = renderToStaticMarkup(
      <GithubProviderCard
        connection={{
          status: "connected",
          account: { email: "person@example.com", plan_type: "github" },
          limits: null,
          login_mode: "browser",
          active: true,
        }}
        loading={false}
        login={null}
        onCancel={() => undefined}
        onConnect={() => undefined}
        onDisconnect={() => undefined}
        onActiveChange={() => undefined}
      />
    )

    expect(markup).toContain("gap-0 py-0 ring-0")
  })
})
