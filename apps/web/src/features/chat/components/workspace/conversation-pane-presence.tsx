import {
  AnimatePresence,
  motion,
  useIsPresent,
  useReducedMotion,
  type TargetAndTransition,
} from 'motion/react'
import type { ReactNode } from 'react'

import {
  CONVERSATION_MOTION,
  conversationPaneKey,
  type ConversationPaneKind,
} from '@/features/chat/motion/conversation-motion'
import { cn } from '@/lib/utils'

function PresenceLayer({
  children,
  animate,
  enter,
  exit,
}: {
  children: ReactNode
  animate: TargetAndTransition
  enter: TargetAndTransition
  exit: TargetAndTransition
}) {
  const isPresent = useIsPresent()

  return (
    <motion.div
      aria-hidden={!isPresent || undefined}
      inert={!isPresent}
      initial={enter}
      animate={animate}
      exit={exit}
      className={cn(
        'absolute inset-0 min-h-0',
        !isPresent && 'pointer-events-none select-none',
      )}
    >
      {children}
    </motion.div>
  )
}

export function ConversationPanePresence({
  children,
  className,
  conversationKey,
  paneKind,
}: {
  children?: ReactNode
  className?: string
  conversationKey: string
  paneKind: ConversationPaneKind
}) {
  const reduce = useReducedMotion() ?? false
  const ready = paneKind === 'ready'
  const enterDuration = reduce
    ? CONVERSATION_MOTION.pane.exitDuration
    : ready
      ? CONVERSATION_MOTION.pane.enterDuration
      : CONVERSATION_MOTION.skeleton.enterDuration
  const opacityTransition = {
    duration: enterDuration,
    ease: CONVERSATION_MOTION.ease,
  }
  const enter: TargetAndTransition = {
    opacity: 0,
    transition: opacityTransition,
  }
  const animate: TargetAndTransition = {
    opacity: 1,
    transition: opacityTransition,
  }
  const exit: TargetAndTransition = {
    opacity: 0,
    transition: {
      duration: CONVERSATION_MOTION.pane.exitDuration,
      ease: CONVERSATION_MOTION.ease,
    },
  }

  return (
    <div className={cn('relative min-h-0 flex-1', className)}>
      <AnimatePresence initial={false} mode="sync">
        {children ? (
          <PresenceLayer
            key={conversationPaneKey(conversationKey, paneKind)}
            animate={animate}
            enter={enter}
            exit={exit}
          >
            {children}
          </PresenceLayer>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
