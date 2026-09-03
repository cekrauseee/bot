import { describe, expect, it } from "vitest"

import {
  clampBrowserPictureInPicturePosition,
  getBrowserPictureInPictureBounds,
  getBrowserPictureInPictureCoordinates,
  getBrowserPictureInPictureCornerForArrow,
  getBrowserPictureInPicturePositionForPointer,
  getNearestBrowserPictureInPictureCorner,
} from "@/features/conversation/components/browser-picture-in-picture-position"

describe("browser picture-in-picture position", () => {
  const bounds = getBrowserPictureInPictureBounds(
    { height: 240, width: 320 },
    { height: 800, width: 1200 },
    { bottom: 96, horizontal: 24, top: 16 }
  )

  it("derives four exact presets inside the conversation viewport", () => {
    expect(bounds).toEqual({ maxX: 856, maxY: 464, minX: 24, minY: 16 })
    expect(getBrowserPictureInPictureCoordinates("top-start", bounds)).toEqual({
      x: 24,
      y: 16,
    })
    expect(getBrowserPictureInPictureCoordinates("top-end", bounds)).toEqual({
      x: 856,
      y: 16,
    })
    expect(
      getBrowserPictureInPictureCoordinates("bottom-start", bounds)
    ).toEqual({ x: 24, y: 464 })
    expect(getBrowserPictureInPictureCoordinates("bottom-end", bounds)).toEqual(
      { x: 856, y: 464 }
    )
  })

  it.each([
    [{ x: 40, y: 40 }, "top-start"],
    [{ x: 840, y: 40 }, "top-end"],
    [{ x: 40, y: 450 }, "bottom-start"],
    [{ x: 840, y: 450 }, "bottom-end"],
    [{ x: 500, y: 300 }, "bottom-end"],
  ] as const)("snaps %o to the nearest preset", (position, expected) => {
    expect(getNearestBrowserPictureInPictureCorner(position, bounds)).toBe(
      expected
    )
  })

  it("accounts for the conversation container origin and grab point", () => {
    expect(
      getBrowserPictureInPicturePositionForPointer(
        { x: 500, y: 300 },
        { x: 280, y: 56 },
        { x: 100, y: 50 },
        bounds
      )
    ).toEqual({ x: 120, y: 194 })
  })

  it("preserves the rendered position when a snap is interrupted", () => {
    const renderedPosition = { x: 600, y: 300 }
    const containerOrigin = { x: 280, y: 56 }
    const grabOffset = { x: 150, y: 100 }
    const pointer = {
      x: containerOrigin.x + renderedPosition.x + grabOffset.x,
      y: containerOrigin.y + renderedPosition.y + grabOffset.y,
    }

    expect(
      getBrowserPictureInPicturePositionForPointer(
        pointer,
        containerOrigin,
        grabOffset,
        bounds
      )
    ).toEqual(renderedPosition)
  })

  it("clamps pointer drags that leave every edge of the viewport", () => {
    expect(
      getBrowserPictureInPicturePositionForPointer(
        { x: -10_000, y: -10_000 },
        { x: 280, y: 56 },
        { x: 100, y: 50 },
        bounds
      )
    ).toEqual({ x: 24, y: 16 })
    expect(
      getBrowserPictureInPicturePositionForPointer(
        { x: 10_000, y: 10_000 },
        { x: 280, y: 56 },
        { x: 100, y: 50 },
        bounds
      )
    ).toEqual({ x: 856, y: 464 })
  })

  it("re-clamps the current position after the container shrinks", () => {
    const smallerBounds = getBrowserPictureInPictureBounds(
      { height: 240, width: 320 },
      { height: 600, width: 800 },
      { bottom: 96, horizontal: 24, top: 16 }
    )

    expect(
      clampBrowserPictureInPicturePosition({ x: 856, y: 464 }, smallerBounds)
    ).toEqual({ x: 456, y: 264 })
  })

  it("uses the safest visible origin when the card exceeds the viewport", () => {
    const constrainedBounds = getBrowserPictureInPictureBounds(
      { height: 240, width: 320 },
      { height: 200, width: 300 },
      { bottom: 96, horizontal: 24, top: 16 }
    )

    expect(constrainedBounds).toEqual({
      maxX: 0,
      maxY: 0,
      minX: 0,
      minY: 0,
    })
    expect(
      clampBrowserPictureInPicturePosition(
        { x: Number.POSITIVE_INFINITY, y: Number.NEGATIVE_INFINITY },
        constrainedBounds
      )
    ).toEqual({ x: 0, y: 0 })
  })

  it("keeps logical corners and arrow movement correct in RTL", () => {
    expect(
      getBrowserPictureInPictureCoordinates("top-start", bounds, true)
    ).toEqual({ x: 856, y: 16 })
    expect(
      getNearestBrowserPictureInPictureCorner({ x: 840, y: 40 }, bounds, true)
    ).toBe("top-start")
    expect(
      getBrowserPictureInPictureCornerForArrow("bottom-end", "ArrowLeft", true)
    ).toBe("bottom-end")
    expect(
      getBrowserPictureInPictureCornerForArrow("bottom-end", "ArrowRight", true)
    ).toBe("bottom-start")
  })

  it("moves vertically and ignores unrelated keyboard input", () => {
    expect(
      getBrowserPictureInPictureCornerForArrow("bottom-end", "ArrowUp")
    ).toBe("top-end")
    expect(
      getBrowserPictureInPictureCornerForArrow("top-start", "ArrowDown")
    ).toBe("bottom-start")
    expect(
      getBrowserPictureInPictureCornerForArrow("bottom-end", "Escape")
    ).toBeUndefined()
  })
})
