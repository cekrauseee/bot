type TurnSpacerHeightInput = {
  naturalContentEnd: number
  scrollTop: number
  viewportHeight: number
}

export function calculateTurnSpacerHeight({
  naturalContentEnd,
  scrollTop,
  viewportHeight,
}: TurnSpacerHeightInput) {
  return Math.max(0, Math.ceil(scrollTop + viewportHeight - naturalContentEnd))
}

export function calculateTurnScrollTop(
  anchorTop: number,
  initialInset: number,
  anchorLift = 0
) {
  return Math.max(0, anchorTop - Math.max(0, initialInset - anchorLift))
}

export function calculateTurnSpacerCorrection(
  targetScrollTop: number,
  maximumScrollTop: number
) {
  return Math.max(0, Math.ceil(targetScrollTop - maximumScrollTop))
}
