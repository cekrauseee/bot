import { describe, expect, it } from "vitest"

import { shouldFocusComposerForKey } from "@/features/composer/hooks/use-global-composer-input"

const keyInput = {
  altGraph: false,
  altKey: false,
  ctrlKey: false,
  defaultPrevented: false,
  isComposing: false,
  key: "a",
  metaKey: false,
}

describe("global composer input", () => {
  it("redirects printable characters and punctuation", () => {
    expect(shouldFocusComposerForKey(keyInput)).toBe(true)
    expect(shouldFocusComposerForKey({ ...keyInput, key: "?" })).toBe(true)
    expect(shouldFocusComposerForKey({ ...keyInput, key: " " })).toBe(true)
  })

  it("redirects Control or Command paste shortcuts", () => {
    expect(
      shouldFocusComposerForKey({ ...keyInput, ctrlKey: true, key: "v" })
    ).toBe(true)
    expect(
      shouldFocusComposerForKey({ ...keyInput, metaKey: true, key: "V" })
    ).toBe(true)
  })

  it("preserves special keys and non-paste shortcuts", () => {
    expect(shouldFocusComposerForKey({ ...keyInput, key: "ArrowDown" })).toBe(
      false
    )
    expect(
      shouldFocusComposerForKey({ ...keyInput, ctrlKey: true, key: "c" })
    ).toBe(false)
    expect(
      shouldFocusComposerForKey({ ...keyInput, altKey: true, key: "a" })
    ).toBe(false)
  })

  it("preserves composition and events already handled by another control", () => {
    expect(shouldFocusComposerForKey({ ...keyInput, isComposing: true })).toBe(
      false
    )
    expect(
      shouldFocusComposerForKey({ ...keyInput, defaultPrevented: true })
    ).toBe(false)
  })

  it("allows printable AltGraph characters", () => {
    expect(
      shouldFocusComposerForKey({
        ...keyInput,
        altGraph: true,
        altKey: true,
        ctrlKey: true,
        key: "@",
      })
    ).toBe(true)
  })
})
