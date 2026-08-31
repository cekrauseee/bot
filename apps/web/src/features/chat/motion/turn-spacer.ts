/** Layout coordinates ignore the entrance transforms on message rows. */
function layoutTop(element: HTMLElement) {
  let top = 0
  let node: HTMLElement | null = element
  while (node) {
    top += node.offsetTop
    node = node.offsetParent as HTMLElement | null
    if (node) top += node.clientTop
  }
  return top
}

/** Temporary geometry owned by one mounted transcript, never persisted. */
export function createTurnSpacer(viewport: HTMLElement, content: HTMLElement, spacer: HTMLElement) {
  let consumedKey: string | undefined
  let anchor: HTMLElement | undefined
  let anchorCorrection = 0
  let height = 0
  let previousScrollTop = viewport.scrollTop

  const writeHeight = (next: number) => {
    if (next === height) return
    height = next
    spacer.style.height = `${height}px`
  }
  const clear = () => {
    anchor = undefined
    writeHeight(0)
  }
  const resize = () => {
    if (!anchor) return
    if (!content.contains(anchor)) { clear(); return }
    const rows = content.querySelectorAll<HTMLElement>('[data-slot="message"]')
    const last = rows[rows.length - 1]
    if (!last) { clear(); return }
    const style = getComputedStyle(content)
    const paddingTop = parseFloat(style.paddingTop) || 0
    const paddingBottom = parseFloat(style.paddingBottom) || 0
    const anchorIndex = Array.from(rows).indexOf(anchor)
    const previous = anchorIndex > 0 ? rows[anchorIndex - 1] : undefined
    const previousOverlap = previous
      ? Math.max(0, layoutTop(previous) + previous.offsetHeight - (layoutTop(anchor) - paddingTop))
      : 0
    // Keep the previous surface fully outside the viewport, including its border.
    anchorCorrection = previousOverlap > 0 ? previousOverlap + 2 : 0
    const turnHeight = layoutTop(last) + last.offsetHeight - layoutTop(anchor)
    writeHeight(Math.max(0, viewport.clientHeight - paddingTop - paddingBottom - turnHeight + anchorCorrection))
    // Once filled, later content changes must not resurrect the empty space.
    if (height === 0) anchor = undefined
  }

  return {
    start(messageKey?: string) {
      if (!messageKey) { clear(); return null }
      if (consumedKey === messageKey) return null
      const rows = Array.from(content.querySelectorAll<HTMLElement>('[data-slot="message"]'))
      const next = rows.find((row) => row.dataset.messageKey === messageKey)
      if (!next) return null
      consumedKey = messageKey
      anchor = next
      resize()
      previousScrollTop = viewport.scrollTop
      const inset = parseFloat(getComputedStyle(content).paddingTop) || 0
      return Math.max(0, layoutTop(next) - layoutTop(viewport) - viewport.clientTop - inset + anchorCorrection)
    },
    resize,
    onScroll(userInitiated: boolean) {
      const top = viewport.scrollTop
      const movedUp = top < previousScrollTop
      previousScrollTop = top
      if (userInitiated && movedUp && height > 0 &&
        viewport.scrollHeight - viewport.clientHeight - top >= height) {
        // Removing only space below the viewport preserves the visible position.
        clear()
      }
    },
    dispose: clear,
  }
}
