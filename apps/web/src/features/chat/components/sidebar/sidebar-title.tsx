import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState, type RefObject } from 'react'

import { TextShimmer } from '@/components/motion/text-shimmer'
import { TextCascade } from '@/components/motion/text-cascade'
import { SIDEBAR_ACTION_REVEAL_DURATION } from '../../motion/sidebar-motion'

export function SidebarTitle({ title, active, shimmer = false, actionsRef, actionsVisible = false }: {
  title: string
  active: boolean
  shimmer?: boolean
  actionsRef?: RefObject<HTMLDivElement | null>
  actionsVisible?: boolean
}) {
  const reduce = useReducedMotion() ?? false
  const viewportRef = useRef<HTMLSpanElement>(null)
  const labelRef = useRef<HTMLSpanElement>(null)
  const [distance, setDistance] = useState(0)

  useEffect(() => {
    const viewport = viewportRef.current
    const label = labelRef.current
    if (!viewport || !label) return
    const measure = () => {
      const bounds = viewport.getBoundingClientRect()
      const overlay = actionsVisible ? actionsRef?.current?.getBoundingClientRect() : undefined
      const coveredWidth = overlay
        ? Math.max(0, getComputedStyle(viewport).direction === 'rtl'
          ? overlay.right - bounds.left
          : bounds.right - overlay.left)
        : 0
      const availableWidth = Math.max(0, viewport.clientWidth - coveredWidth)
      setDistance(label.scrollWidth > availableWidth ? label.scrollWidth + 24 : 0)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(viewport)
    observer.observe(label)
    if (actionsRef?.current) observer.observe(actionsRef.current)
    return () => observer.disconnect()
  }, [title, actionsRef, actionsVisible])

  const running = active && distance > 0 && !reduce
  const revealDelay = running && actionsVisible ? SIDEBAR_ACTION_REVEAL_DURATION : 0
  const cascade = <TextCascade text={title} className="block max-w-full truncate" />
  const content = shimmer && !reduce
    ? <TextShimmer className="block max-w-full">{cascade}</TextShimmer>
    : cascade

  return (
    <span ref={viewportRef} title={reduce ? title : undefined} className="relative block min-w-0 flex-1 overflow-hidden text-start">
      <motion.span
        className="block truncate"
        initial={false}
        animate={{ opacity: running ? 0 : 1 }}
        transition={{ duration: 0, delay: revealDelay }}
      >
        {content}
      </motion.span>
      <motion.span
        aria-hidden="true"
        className="absolute inset-y-0 start-0 flex w-max items-center gap-6 whitespace-nowrap"
        style={{ visibility: running ? 'visible' : 'hidden' }}
        initial={false}
        animate={{ x: running ? [0, -distance] : 0, opacity: running ? 1 : 0 }}
        transition={running
          ? {
              opacity: { duration: 0, delay: revealDelay },
              x: { delay: revealDelay, duration: Math.max(2.4, distance / 34), ease: 'linear', repeat: Infinity, repeatDelay: 2 },
            }
          : { duration: 0 }}
      >
        <span ref={labelRef}>{content}</span>
        {running ? <span>{content}</span> : null}
      </motion.span>
    </span>
  )
}
