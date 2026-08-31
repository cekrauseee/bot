type ContentBounds = { top: number; bottom: number; height: number }

export function scrollBoundaryState(
  viewportTop: number,
  viewportBottom: number,
  first?: ContentBounds,
  last?: ContentBounds,
) {
  return {
    scrolled: Boolean(first && first.height > 0 && first.top <= viewportTop),
    overflowingBelow: Boolean(last && last.height > 0 && last.bottom > viewportBottom),
  }
}
