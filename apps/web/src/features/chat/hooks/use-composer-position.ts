import { useReducedMotion } from 'motion/react'
import { useCallback, useLayoutEffect, useRef } from 'react'
import { createComposerPosition } from '../motion/composer-position'
import type { ConversationEntry } from '../motion/conversation-entry'

/** The dock stays in normal flow; only the input surface moves. */
export function useComposerPosition(centered: boolean, viewportId: string, entry: ConversationEntry, conversationKey: string) {
  const dockRef = useRef<HTMLDivElement>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const positionRef = useRef<ReturnType<typeof createComposerPosition> | null>(null)
  const reduce = useReducedMotion() ?? false

  useLayoutEffect(() => {
    const surface = surfaceRef.current
    const dock = dockRef.current
    // The ancestor's ref may not be attached yet during a child's layout effect.
    const viewport = document.getElementById(viewportId)
    if (!surface || !dock || !viewport) return
    const position = createComposerPosition(surface, dock, viewport, entry.begin)
    positionRef.current = position
    const observer = new ResizeObserver(() => position.resize())
    observer.observe(surface)
    observer.observe(viewport)
    return () => {
      observer.disconnect()
      position.dispose()
      positionRef.current = null
    }
  }, [viewportId, entry])

  useLayoutEffect(() => {
    entry.select(conversationKey)
    positionRef.current?.update(centered, reduce)
  })

  const captureSubmitPosition = useCallback(() => {
    positionRef.current?.captureSubmitPosition()
  }, [])

  return { dockRef, surfaceRef, captureSubmitPosition }
}
