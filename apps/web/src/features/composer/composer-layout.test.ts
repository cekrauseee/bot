import { describe, expect, it } from "vitest"

import { shouldStackComposer } from "@/features/composer/composer-layout"

describe("composer adaptive layout", () => {
  it("keeps a prompt that fits on one visual line inline", () => {
    expect(
      shouldStackComposer({
        availableWidth: 240,
        textWidth: 180,
        value: "A short prompt",
      })
    ).toBe(false)
  })

  it("stacks controls when a prompt wraps", () => {
    expect(
      shouldStackComposer({
        availableWidth: 240,
        textWidth: 280,
        value: "A prompt that no longer fits beside the controls",
      })
    ).toBe(true)
  })

  it("stacks controls for an explicit line break", () => {
    expect(
      shouldStackComposer({
        availableWidth: 240,
        textWidth: 80,
        value: "First line\nSecond line",
      })
    ).toBe(true)
  })
})
