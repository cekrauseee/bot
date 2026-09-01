import { ArrowDown } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Button } from '@/components/motion/button/base'
import { EASE_OUT, SPRING_PRESS, SPRING_SWAP } from '@/lib/ease'
import { useHoverCapable } from '@/lib/hooks/use-hover-capable'
import { cn } from '@/lib/utils'

export function ScrollToBottomButton({
  visible,
  busy,
  onClick,
}: {
  visible: boolean
  busy?: boolean
  onClick: (keyboard: boolean) => void
}) {
  const reduce = useReducedMotion() ?? false
  const canHover = useHoverCapable()

  return (
    <motion.div
      initial={false}
      animate={{
        opacity: visible ? 1 : 0,
        y: reduce || visible ? 0 : 8,
        scale: reduce || visible ? 1 : 0.88,
      }}
      transition={reduce
        ? { duration: 0 }
        : visible
          ? { ...SPRING_SWAP, damping: 20, opacity: { duration: 0.14, ease: EASE_OUT } }
          : { duration: 0.14, ease: EASE_OUT }}
      aria-hidden={!visible}
      inert={!visible}
      className="pointer-events-none absolute inset-x-0 bottom-8 flex justify-center"
    >
      <Button
        variant="secondary"
        size="icon"
        pressScale={0.96}
        whileHover={!reduce && canHover ? { y: -1.5, scale: 1.06 } : undefined}
        transition={SPRING_PRESS}
        aria-label="Scroll to bottom"
        title={busy ? 'Scroll to bottom · Response in progress' : 'Scroll to bottom'}
        onClick={(event) => onClick(event.detail === 0)}
        className={cn(
          'relative size-8 rounded-full shadow-sm transition-shadow duration-150 hover:shadow-md motion-reduce:transition-none after:absolute after:-inset-1.5 after:content-[\'\']',
          visible ? 'pointer-events-auto' : 'pointer-events-none',
        )}
      >
        <span aria-hidden="true" className="relative flex size-[18px] items-center justify-center">
          <AnimatePresence initial={false}>
            <motion.span
              key={busy ? 'working' : 'arrow'}
              initial={reduce ? false : { opacity: 0, scale: 0.25, filter: 'blur(4px)' }}
              animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.25, filter: 'blur(4px)' }}
              transition={reduce ? { duration: 0 } : SPRING_SWAP}
              className="absolute inset-0 flex items-center justify-center gap-0.5"
            >
              {busy ? [0, 1, 2].map((dot) => (
                <motion.span
                  key={dot}
                  className="size-[3px] rounded-full bg-current"
                  animate={{ y: !reduce && visible ? [0, -2.5, 0] : 0 }}
                  transition={!reduce && visible ? {
                    duration: 0.6,
                    delay: dot * 0.12,
                    repeat: Infinity,
                    repeatDelay: 0.6,
                    ease: 'easeInOut',
                  } : { duration: 0 }}
                />
              )) : <ArrowDown size={18} strokeWidth={1.75} />}
            </motion.span>
          </AnimatePresence>
        </span>
      </Button>
    </motion.div>
  )
}
