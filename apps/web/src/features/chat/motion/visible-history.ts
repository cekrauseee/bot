type RowBounds = { top: number; bottom: number; height: number }

/** Rows are ordered vertically; stop as soon as the viewport's leading edge is passed. */
export function visibleHistoryIndices(count: number, top: number, bottom: number, boundsAt: (index: number) => RowBounds) {
  const visible: number[] = []
  for (let index = count - 1; index >= 0; index -= 1) {
    const bounds = boundsAt(index)
    if (bounds.bottom <= top) break
    if (bounds.height > 0 && bounds.top < bottom) visible.push(index)
  }
  return visible.reverse()
}
