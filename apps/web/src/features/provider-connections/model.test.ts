import { describe, expect, it } from "vitest"

import type { ProviderConnection } from "@/features/provider-connections/api"
import { planLabel, usageWindow } from "@/features/provider-connections/model"

function connectedConnection(
  limits: ProviderConnection["limits"]
): ProviderConnection {
  return {
    status: "connected",
    account: { email: "person@example.com", plan_type: "plus" },
    limits,
    login_mode: "browser",
    active: true,
  }
}

describe("provider presentation model", () => {
  it("maps Codex plan identifiers to product labels", () => {
    expect(planLabel("pro_lite")).toBe("Pro 5x Subscription")
    expect(planLabel("pro-lite")).toBe("Pro 5x Subscription")
    expect(planLabel("Pro Lite")).toBe("Pro 5x Subscription")
    expect(planLabel("prolite")).toBe("Pro 5x Subscription")
    expect(planLabel("plus")).toBe("Plus Subscription")
    expect(planLabel("pro")).toBe("Pro 20x Subscription")
    expect(planLabel("team")).toBe("Team Subscription")
    expect(planLabel("enterprise")).toBe("Enterprise Subscription")
  })

  it("uses friendly fallbacks for missing or unknown plan identifiers", () => {
    expect(planLabel("custom")).toBe("Other Subscription")
    expect(planLabel("unknown")).toBe("Other Subscription")
    expect(planLabel(null)).toBe("Subscription unavailable")
    expect(planLabel(" ")).toBe("Subscription unavailable")
  })

  it("uses the primary usage window and falls back to the secondary window", () => {
    const secondary = {
      used_percent: 80,
      window_duration_minutes: 60,
      resets_at: "2030-01-02T00:00:00.000Z",
    }
    const primary = {
      used_percent: 20,
      window_duration_minutes: 300,
      resets_at: "2030-01-01T00:00:00.000Z",
    }

    expect(
      usageWindow(connectedConnection({ primary, secondary, reached: false }))
    ).toBe(primary)
    expect(
      usageWindow(
        connectedConnection({ primary: null, secondary, reached: false })
      )
    ).toBe(secondary)
  })
})
