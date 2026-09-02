import { describe, expect, it } from "vitest"

import { shouldSubmitComposerKey } from "@/features/composer/composer-keyboard"

describe("composer keyboard behavior", () => {
  it("submits with Enter", () => {
    expect(
      shouldSubmitComposerKey({
        isComposing: false,
        key: "Enter",
        shiftKey: false,
      })
    ).toBe(true)
  })

  it("keeps Shift+Enter as a line break", () => {
    expect(
      shouldSubmitComposerKey({
        isComposing: false,
        key: "Enter",
        shiftKey: true,
      })
    ).toBe(false)
  })

  it("does not submit while an input method is composing text", () => {
    expect(
      shouldSubmitComposerKey({
        isComposing: true,
        key: "Enter",
        shiftKey: false,
      })
    ).toBe(false)
  })
})
