import { AnimatePresence, motion } from 'motion/react'
import type { ReactNode } from 'react'

import { CONVERSATION_MOTION } from '@/features/chat/motion/conversation-motion'
import { cn } from '@/lib/utils'
import { useLoadingPresence } from './use-loading-presence'

export function LoadingPresence({
  children,
  className,
  defer = false,
  presenceKey,
  show,
}: {
  children: ReactNode
  className?: string
  defer?: boolean
  presenceKey: string
  show: boolean
}) {
  const visible = useLoadingPresence({ defer, presenceKey, show })

  return (
    <AnimatePresence initial={false} mode="sync">
      {visible ? (
        <motion.div
          key={presenceKey}
          initial={{ opacity: 0 }}
          animate={{
            opacity: 1,
            transition: {
              duration: CONVERSATION_MOTION.skeleton.enterDuration,
              ease: CONVERSATION_MOTION.ease,
            },
          }}
          exit={{
            opacity: 0,
            transition: {
              duration: CONVERSATION_MOTION.skeleton.exitDuration,
              ease: CONVERSATION_MOTION.ease,
            },
          }}
          className={cn('min-h-0', className)}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
