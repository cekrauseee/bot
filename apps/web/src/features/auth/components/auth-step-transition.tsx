import { AnimatePresence, motion, useIsPresent, useReducedMotion } from 'motion/react'
import { forwardRef, useCallback, useState, type ReactNode } from 'react'
import { EASE_OUT } from '@/lib/ease'
import { INTERFACE_ENTER_FROM, INTERFACE_ENTER_TO, interfaceRevealTransition } from '@/lib/interface-motion'

const StepLayer = forwardRef<HTMLDivElement, { children: ReactNode }>(function StepLayer({ children }, ref) {
  const present = useIsPresent()
  const reduce = useReducedMotion() ?? false
  return (
    <motion.div
      ref={ref}
      inert={!present}
      aria-hidden={!present || undefined}
      className="w-full"
      initial={reduce ? { opacity: 0 } : INTERFACE_ENTER_FROM}
      animate={reduce ? { opacity: 1 } : INTERFACE_ENTER_TO}
      exit={{ opacity: 0, transition: { duration: 0.12, ease: EASE_OUT } }}
      transition={interfaceRevealTransition(0, 1, reduce)}
    >
      {children}
    </motion.div>
  )
})

export function AuthStepTransition({ step, children }: { step: string; children: ReactNode }) {
  const reduce = useReducedMotion() ?? false
  const [height, setHeight] = useState<number>()
  const measure = useCallback((node: HTMLDivElement | null) => {
    if (!node) return
    const observer = new ResizeObserver(() => setHeight(node.offsetHeight))
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  return (
    <motion.div
      initial={false}
      animate={{ height: height ?? 'auto' }}
      className="relative"
      transition={reduce ? { duration: 0 } : interfaceRevealTransition(0, 1, false)}
    >
      <div ref={measure} className="relative">
        <AnimatePresence initial={false} mode="popLayout">
          <StepLayer key={step}>{children}</StepLayer>
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
