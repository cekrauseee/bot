export const BROWSER_PICTURE_IN_PICTURE_CORNERS = [
  "top-start",
  "top-end",
  "bottom-start",
  "bottom-end",
] as const

export type BrowserPictureInPictureCorner =
  (typeof BROWSER_PICTURE_IN_PICTURE_CORNERS)[number]

export type BrowserPictureInPicturePosition = {
  x: number
  y: number
}

export type BrowserPictureInPictureSize = {
  height: number
  width: number
}

export type BrowserPictureInPictureViewport = BrowserPictureInPictureSize

export type BrowserPictureInPictureInsets = {
  bottom: number
  horizontal: number
  top: number
}

export type BrowserPictureInPictureBounds = {
  maxX: number
  maxY: number
  minX: number
  minY: number
}

export const DEFAULT_BROWSER_PICTURE_IN_PICTURE_CORNER: BrowserPictureInPictureCorner =
  "bottom-end"

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum)
}

function getAxisBounds(
  viewportSize: number,
  itemSize: number,
  startInset: number,
  endInset: number
) {
  const lastFullyVisiblePosition = Math.max(0, viewportSize - itemSize)
  const minimum = clamp(startInset, 0, lastFullyVisiblePosition)
  const maximum = clamp(
    viewportSize - endInset - itemSize,
    minimum,
    lastFullyVisiblePosition
  )

  return { maximum, minimum }
}

export function getBrowserPictureInPictureBounds(
  card: BrowserPictureInPictureSize,
  viewport: BrowserPictureInPictureViewport,
  insets: BrowserPictureInPictureInsets
): BrowserPictureInPictureBounds {
  const horizontal = getAxisBounds(
    viewport.width,
    card.width,
    insets.horizontal,
    insets.horizontal
  )
  const vertical = getAxisBounds(
    viewport.height,
    card.height,
    insets.top,
    insets.bottom
  )

  return {
    maxX: horizontal.maximum,
    maxY: vertical.maximum,
    minX: horizontal.minimum,
    minY: vertical.minimum,
  }
}

export function clampBrowserPictureInPicturePosition(
  position: BrowserPictureInPicturePosition,
  bounds: BrowserPictureInPictureBounds
): BrowserPictureInPicturePosition {
  return {
    x: clamp(position.x, bounds.minX, bounds.maxX),
    y: clamp(position.y, bounds.minY, bounds.maxY),
  }
}

export function getBrowserPictureInPictureCoordinates(
  corner: BrowserPictureInPictureCorner,
  bounds: BrowserPictureInPictureBounds,
  rightToLeft = false
): BrowserPictureInPicturePosition {
  const [vertical, horizontal] = corner.split("-") as [
    "top" | "bottom",
    "start" | "end",
  ]
  const startIsMinimum = !rightToLeft
  const horizontalIsMinimum =
    horizontal === "start" ? startIsMinimum : !startIsMinimum

  return {
    x: horizontalIsMinimum ? bounds.minX : bounds.maxX,
    y: vertical === "top" ? bounds.minY : bounds.maxY,
  }
}

export function getNearestBrowserPictureInPictureCorner(
  position: BrowserPictureInPicturePosition,
  bounds: BrowserPictureInPictureBounds,
  rightToLeft = false
) {
  let nearest = BROWSER_PICTURE_IN_PICTURE_CORNERS[0]
  let nearestDistance = Number.POSITIVE_INFINITY

  for (const corner of BROWSER_PICTURE_IN_PICTURE_CORNERS) {
    const target = getBrowserPictureInPictureCoordinates(
      corner,
      bounds,
      rightToLeft
    )
    const distance = (position.x - target.x) ** 2 + (position.y - target.y) ** 2

    if (distance < nearestDistance) {
      nearest = corner
      nearestDistance = distance
    }
  }

  return nearest
}

export function getBrowserPictureInPicturePositionForPointer(
  pointer: BrowserPictureInPicturePosition,
  containerOrigin: BrowserPictureInPicturePosition,
  grabOffset: BrowserPictureInPicturePosition,
  bounds: BrowserPictureInPictureBounds
) {
  return clampBrowserPictureInPicturePosition(
    {
      x: pointer.x - containerOrigin.x - grabOffset.x,
      y: pointer.y - containerOrigin.y - grabOffset.y,
    },
    bounds
  )
}

export function getBrowserPictureInPictureCornerForArrow(
  corner: BrowserPictureInPictureCorner,
  key: string,
  rightToLeft = false
) {
  const [vertical, horizontal] = corner.split("-") as [
    "top" | "bottom",
    "start" | "end",
  ]
  const nextVertical =
    key === "ArrowUp" ? "top" : key === "ArrowDown" ? "bottom" : vertical
  const nextHorizontal =
    key === "ArrowLeft"
      ? rightToLeft
        ? "end"
        : "start"
      : key === "ArrowRight"
        ? rightToLeft
          ? "start"
          : "end"
        : horizontal

  if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(key)) {
    return undefined
  }

  return `${nextVertical}-${nextHorizontal}` as BrowserPictureInPictureCorner
}
