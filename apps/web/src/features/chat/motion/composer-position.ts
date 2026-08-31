import { CONVERSATION_ENTRY } from './conversation-entry'

const DURATION_MS = CONVERSATION_ENTRY.durationMs
const transform = (y: number) => `translateY(${y}px)`

type Bounds = Pick<DOMRect, 'top' | 'height'>
type Box = { getBoundingClientRect: () => Bounds }
type Surface = Box & Pick<HTMLElement, 'offsetTop' | 'offsetHeight' | 'animate'> & {
  style: Pick<CSSStyleDeclaration, 'transform' | 'willChange'>
}
type Viewport = Box & Pick<HTMLElement, 'clientWidth' | 'clientHeight'>

/** Owns one native transform animation; no React or JavaScript frame loop. */
export function createComposerPosition(surface: Surface, dock: Box, viewport: Viewport, onDockStart?: () => void) {
  let centered: boolean | null = null
  let reduced = false
  let animation: Animation | null = null
  let duration = DURATION_MS
  let capturedTop: number | null = null
  let dockOffset = 0
  let targetY = 0
  let width = 0
  let height = 0
  let surfaceHeight = 0

  const measure = () => {
    const area = viewport.getBoundingClientRect()
    const top = dock.getBoundingClientRect().top + surface.offsetTop
    width = viewport.clientWidth
    height = viewport.clientHeight
    surfaceHeight = surface.offsetHeight
    return {
      top,
      dockOffset: top - area.top,
      // Both boxes share ancestors, so their transforms cancel out here.
      y: surface.getBoundingClientRect().top - top,
      target: centered
        ? Math.min(0, area.top + (area.height - surfaceHeight) / 2 - 24 - top)
        : 0,
    }
  }

  const cancel = () => {
    if (!animation) return
    animation.onfinish = null
    animation.cancel()
    animation = null
  }

  const move = (from: number, to: number, milliseconds: number) => {
    // The final inline style survives finishing/canceling without a fill effect.
    // Read the visible starting position before removing the previous animation.
    surface.style.transform = transform(to)
    cancel()
    surface.style.willChange = centered && !reduced ? 'transform' : ''
    if (reduced || milliseconds <= 0 || Math.abs(from - to) < 0.5 ||
      typeof surface.animate !== 'function') return

    surface.style.willChange = 'transform'
    duration = milliseconds
    const next = surface.animate([
      { transform: transform(from) },
      { transform: transform(to) },
    ], { duration, easing: CONVERSATION_ENTRY.cssEase })
    animation = next
    next.onfinish = () => {
      if (animation !== next) return
      cancel()
      surface.style.willChange = centered ? 'transform' : ''
    }
  }

  return {
    update(nextCentered: boolean, nextReduced: boolean) {
      if (centered === nextCentered && reduced === nextReduced) {
        capturedTop = null
        return
      }
      const initial = centered === null
      centered = nextCentered
      reduced = nextReduced
      const geometry = measure()
      // Draft clearing can move the dock before this layout effect runs. Keep
      // the visible top from before that commit, including in-flight motion.
      const from = capturedTop === null ? geometry.y : capturedTop - geometry.top
      capturedTop = null
      dockOffset = geometry.dockOffset
      targetY = geometry.target
      if (!initial && !centered) onDockStart?.()
      move(from, geometry.target, initial ? 0 : DURATION_MS)
    },
    resize() {
      if (centered === null || (width === viewport.clientWidth &&
        height === viewport.clientHeight && surfaceHeight === surface.offsetHeight)) return

      const geometry = measure()
      // Horizontal sidebar motion must not restart an unrelated vertical glide.
      if (Math.abs(dockOffset - geometry.dockOffset) < 0.5 && Math.abs(targetY - geometry.target) < 0.5) return
      // Use the viewport's coordinate space so an ancestor entrance advancing
      // between observer deliveries is not mistaken for a layout resize.
      const from = dockOffset + geometry.y - geometry.dockOffset
      dockOffset = geometry.dockOffset
      targetY = geometry.target
      const elapsed = typeof animation?.currentTime === 'number' ? animation.currentTime : 0
      // Keep the original deadline through resize deliveries; typing when idle
      // re-centers immediately, without starting a new transition.
      move(from, geometry.target, animation ? Math.max(0, duration - elapsed) : 0)
    },
    captureSubmitPosition() {
      capturedTop = centered ? surface.getBoundingClientRect().top : null
    },
    dispose() {
      // Preserve the committed destination, including StrictMode effect replay.
      cancel()
      surface.style.willChange = ''
    },
  }
}
