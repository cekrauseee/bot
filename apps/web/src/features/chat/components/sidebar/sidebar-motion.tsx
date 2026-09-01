import { motion, useIsPresent, useReducedMotion, type HTMLMotionProps } from 'motion/react'
import { forwardRef } from 'react'

import { cn } from '@/lib/utils'

import { SIDEBAR_LAYOUT_TRANSITION, SIDEBAR_FADE_TRANSITION } from '../../motion/sidebar-motion'

function useSidebarItemMotion() {
  const reduce = useReducedMotion() ?? false
  const present = useIsPresent()
  return {
    layout: reduce ? false as const : 'position' as const,
    initial: { opacity: reduce ? 1 : 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: {
      layout: reduce ? { duration: 0 } : SIDEBAR_LAYOUT_TRANSITION,
      opacity: reduce ? { duration: 0 } : SIDEBAR_FADE_TRANSITION,
    },
    inert: !present,
    'aria-hidden': !present || undefined,
  }
}

// Position-only projection keeps labels, icons and inputs at their original size.
export function SidebarMotionSection({ className, ...props }: HTMLMotionProps<'div'>) {
  const reduce = useReducedMotion() ?? false
  return (
    <motion.div
      {...props}
      layout={reduce ? false : 'position'}
      transition={{ layout: reduce ? { duration: 0 } : SIDEBAR_LAYOUT_TRANSITION }}
      className={cn('relative min-w-0', className)}
    />
  )
}

// Forward the actual node so popLayout can remove exiting rows from document flow.
export const SidebarMotionItem = forwardRef<HTMLDivElement, HTMLMotionProps<'div'>>(
  function SidebarMotionItem({ className, ...props }, ref) {
    const animation = useSidebarItemMotion()
    return <motion.div {...props} {...animation} ref={ref} className={cn('relative min-w-0', className)} />
  },
)

export const SidebarMotionListItem = forwardRef<HTMLLIElement, HTMLMotionProps<'li'>>(
  function SidebarMotionListItem({ className, ...props }, ref) {
    const animation = useSidebarItemMotion()
    return <motion.li {...props} {...animation} ref={ref} className={cn('relative min-w-0', className)} />
  },
)
