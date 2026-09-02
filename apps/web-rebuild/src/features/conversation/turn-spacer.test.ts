import { describe, expect, it } from "vitest"

import {
  calculateTurnScrollTop,
  calculateTurnSpacerCorrection,
  calculateTurnSpacerHeight,
} from "@/features/conversation/turn-spacer"

describe("turn spacer", () => {
  it("positions a new turn slightly above the initial conversation inset", () => {
    expect(calculateTurnScrollTop(640, 40)).toBe(600)
    expect(calculateTurnScrollTop(640, 40, 16)).toBe(616)
    expect(calculateTurnScrollTop(640, 12, 16)).toBe(640)
    expect(calculateTurnScrollTop(24, 40)).toBe(0)
  })

  it("fills the viewport below the anchored turn", () => {
    expect(
      calculateTurnSpacerHeight({
        naturalContentEnd: 920,
        scrollTop: 600,
        viewportHeight: 720,
      })
    ).toBe(400)
  })

  it("adds any missing scroll range after layout", () => {
    expect(calculateTurnSpacerCorrection(600, 420)).toBe(180)
    expect(calculateTurnSpacerCorrection(600, 600)).toBe(0)
    expect(calculateTurnSpacerCorrection(600, 720)).toBe(0)
  })

  it("shrinks with response growth and scroll toward the history", () => {
    expect(
      calculateTurnSpacerHeight({
        naturalContentEnd: 1_120,
        scrollTop: 600,
        viewportHeight: 720,
      })
    ).toBe(200)
    expect(
      calculateTurnSpacerHeight({
        naturalContentEnd: 1_120,
        scrollTop: 480,
        viewportHeight: 720,
      })
    ).toBe(80)
    expect(
      calculateTurnSpacerHeight({
        naturalContentEnd: 1_120,
        scrollTop: 360,
        viewportHeight: 720,
      })
    ).toBe(0)
  })
})
