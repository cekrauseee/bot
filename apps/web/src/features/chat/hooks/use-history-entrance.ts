import { useCallback, useEffect, useRef } from 'react'
import { useReducedMotion } from 'motion/react'
import { EASE_OUT_CSS } from '@/lib/ease'
import { conversationRevealTransition } from '../motion/conversation-motion'
import { CONVERSATION_ENTRY, coordinatedMessageTransition, type ConversationEntry } from '../motion/conversation-entry'
import { visibleHistoryIndices } from '../motion/visible-history'

/** Animate only initially visible rows, after the scroller positions the transcript. */
export function useHistoryEntrance(enabled: boolean, entry?: ConversationEntry, conversationKey?: string) {
  const reduce = useReducedMotion() ?? false
  const cleanup = useRef<(() => void) | undefined>(undefined)
  useEffect(() => () => cleanup.current?.(), [reduce])

  return useCallback((viewport: HTMLElement) => {
    cleanup.current?.()
    const shell = viewport.closest<HTMLElement>('[data-slot="message-scroller"]')
    if (!enabled) { delete shell?.dataset.historyPending; return }
    const rows = Array.from(viewport.querySelectorAll<HTMLElement>('[data-slot="message"]'))
    const top = viewport.getBoundingClientRect().top + viewport.clientTop
    const visible = visibleHistoryIndices(rows.length, top, top + viewport.clientHeight,
      (index) => rows[index].getBoundingClientRect())
    const elapsed = conversationKey ? entry?.elapsed(conversationKey) : undefined
    const animations: Animation[] = []
    for (const [index, rowIndex] of visible.entries()) {
      const row = rows[rowIndex]
      if (typeof row.animate !== 'function') continue
      const transition = elapsed === undefined
        ? conversationRevealTransition(index, visible.length, reduce)
        : coordinatedMessageTransition(index, visible.length, elapsed, reduce)
      const animation = row.animate([
        { opacity: 0, ...(reduce ? {} : { transform: 'translateY(12px)' }) },
        { opacity: 1, ...(reduce ? {} : { transform: 'translateY(0px)' }) },
      ], {
        duration: transition.duration * 1000,
        delay: transition.delay * 1000,
        easing: elapsed === undefined ? EASE_OUT_CSS : CONVERSATION_ENTRY.cssEase,
        fill: 'backwards',
      })
      animation.onfinish = () => { animation.onfinish = null; animation.cancel() }
      animations.push(animation)
    }
    delete shell?.dataset.historyPending
    cleanup.current = () => {
      for (const animation of animations) { animation.onfinish = null; animation.cancel() }
    }
  }, [enabled, entry, conversationKey, reduce])
}
