import { useReducedMotion } from 'motion/react'
import { INTERFACE_ENTER_FROM, INTERFACE_ENTER_TO, interfaceRevealTransition } from './interface-motion'

const PAGE_SECTION_DURATION = 0.24
const PAGE_SECTION_STAGGER = 0.10

/** Overlapping page entrances keep the cascade visible without serial delays. */
export function usePageEntrance(index: number, count = 4) {
  const reduce = useReducedMotion() ?? false
  return {
    initial: reduce ? { opacity: 0 } : INTERFACE_ENTER_FROM,
    animate: reduce ? { opacity: 1 } : INTERFACE_ENTER_TO,
    transition: {
      ...interfaceRevealTransition(index, count, reduce),
      ...(!reduce ? {
        duration: PAGE_SECTION_DURATION,
        delay: Math.min(Math.max(0, index), Math.max(0, count - 1)) * PAGE_SECTION_STAGGER,
      } : {}),
    },
  }
}
