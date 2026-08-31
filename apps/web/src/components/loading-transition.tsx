import { AnimatePresence, motion, useIsPresent } from 'motion/react'
import type { ReactNode } from 'react'
import { EASE_OUT } from '@/lib/ease'
import { cn } from '@/lib/utils'

function LoadingLayer({ children }: { children: ReactNode }) {
  const present = useIsPresent()
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.16, ease: EASE_OUT } }}
      exit={{ opacity: 0, transition: { duration: 0.12, ease: EASE_OUT } }}
      aria-hidden={!present || undefined}
      inert={!present}
      className={cn('w-full min-w-0', !present && 'pointer-events-none absolute inset-x-0 top-0')}
    >
      {children}
    </motion.div>
  )
}

/** Overlaps loading and ready layers without retaining outgoing layout height. */
export function LoadingTransition({ children, stateKey, className }: {
  children: ReactNode
  stateKey: string
  className?: string
}) {
  return (
    <div className={cn('relative min-w-0', className)}>
      <AnimatePresence initial={false} mode="sync">
        <LoadingLayer key={stateKey}>{children}</LoadingLayer>
      </AnimatePresence>
    </div>
  )
}
