import { useCallback, useRef, useState } from 'react'
import { scrollBoundaryState } from './scroll-boundary-state'

/** Reports the current viewport only, ignoring panes retained for exit motion. */
export function useScrollBoundary(key = 'default') {
  const activeNode = useRef<HTMLElement | null>(null)
  const [state, setState] = useState({ key, scrolled: false, overflowingBelow: false })
  const attachViewport = useCallback((node: HTMLElement | null) => {
    if (!node) return
    activeNode.current = node
    const update = () => {
      if (activeNode.current !== node) return
      const boundary = node.querySelector<HTMLElement>('[data-scroll-boundary]')
      const bounds = boundary?.getBoundingClientRect()
      const viewport = node.getBoundingClientRect()
      const end = node.querySelector<HTMLElement>('[data-scroll-end]')?.getBoundingClientRect()
      const { scrolled, overflowingBelow } = scrollBoundaryState(
        viewport.top + node.clientTop,
        viewport.top + node.clientTop + node.clientHeight,
        bounds,
        end,
      )
      setState((current) => current.key === key && current.scrolled === scrolled &&
        current.overflowingBelow === overflowingBelow
        ? current
        : { key, scrolled, overflowingBelow })
    }
    update()
    let frame = 0
    const scheduleUpdate = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        update()
      })
    }
    node.addEventListener('scroll', update, { passive: true })
    const resize = new ResizeObserver(scheduleUpdate)
    resize.observe(node)
    for (const child of node.children) resize.observe(child)
    const mutation = new MutationObserver(scheduleUpdate)
    mutation.observe(node, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'hidden'],
    })
    return () => {
      node.removeEventListener('scroll', update)
      resize.disconnect()
      mutation.disconnect()
      if (frame) cancelAnimationFrame(frame)
      if (activeNode.current === node) activeNode.current = null
    }
  }, [key])

  return {
    scrolled: state.key === key && state.scrolled,
    overflowingBelow: state.key === key && state.overflowingBelow,
    attachViewport,
  }
}
