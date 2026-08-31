import { Folder } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'

import { TextReveal } from '@/components/motion/text-reveal'
import { ConversationTitleSkeleton } from '@/features/chat/components/loading/conversation-skeleton'
import {
  CONVERSATION_MOTION,
  conversationRevealTransition,
  conversationTitleVisualKey,
} from '@/features/chat/motion/conversation-motion'

function TitleCopy({
  loadingTitle,
  projectName,
  title,
}: {
  loadingTitle: boolean
  projectName?: string
  title: string
}) {
  if (loadingTitle) {
    return <ConversationTitleSkeleton showProject={Boolean(projectName)} />
  }

  return (
    <>
      {projectName ? (
        <>
          <span
            className="inline-flex max-w-28 shrink-0 items-center gap-1.5 text-xs font-normal text-muted-foreground sm:max-w-48"
            title={projectName}
          >
            <Folder className="size-3.5 shrink-0" strokeWidth={1.5} />
            <span className="truncate">{projectName}</span>
          </span>
          <span className="text-xs font-normal text-border">/</span>
        </>
      ) : null}
      <span className="min-w-0 flex-1 truncate">{title}</span>
    </>
  )
}

function TitleVisual({
  loadingTitle,
  projectName,
  reduce,
  title,
}: {
  loadingTitle: boolean
  projectName?: string
  reduce: boolean
  title: string
}) {
  if (loadingTitle) {
    return <ConversationTitleSkeleton showProject={Boolean(projectName)} />
  }

  return (
    <>
      {projectName ? (
        <>
          <motion.span
            initial={reduce
              ? { opacity: 0 }
              : {
                  opacity: 0,
                  y: CONVERSATION_MOTION.title.yOffset,
                  filter: `blur(${CONVERSATION_MOTION.title.blur}px)`,
                }}
            animate={reduce
              ? { opacity: 1 }
              : { opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={conversationRevealTransition(0, 1, reduce)}
            className="inline-flex max-w-28 shrink-0 items-center gap-1.5 text-xs font-normal text-muted-foreground sm:max-w-48"
            title={projectName}
          >
            <Folder className="size-3.5 shrink-0" strokeWidth={1.5} />
            <span className="truncate">{projectName}</span>
          </motion.span>
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={conversationRevealTransition(0, 1, reduce)}
            className="text-xs font-normal text-border"
          >
            /
          </motion.span>
        </>
      ) : null}
      <span className="min-w-0 flex-1 overflow-hidden whitespace-nowrap">
        <TextReveal
          text={title}
          split="word"
          getUnitTransition={(index, count) => conversationRevealTransition(index, count, reduce)}
          blur={CONVERSATION_MOTION.title.blur}
          yOffset={CONVERSATION_MOTION.title.yOffset}
          className="overflow-hidden whitespace-nowrap [&>span]:inline [&>span]:max-w-full [&>span]:overflow-hidden [&>span]:whitespace-nowrap"
        />
      </span>
    </>
  )
}

export function ConversationTitle({
  conversationKey,
  loadingTitle,
  projectName,
  title,
}: {
  conversationKey: string
  loadingTitle: boolean
  projectName?: string
  title: string
}) {
  const reduce = useReducedMotion() ?? false
  const accessibleTitle = loadingTitle
    ? 'Loading conversation title'
    : [projectName, title].filter(Boolean).join(', ')
  const visualKey = conversationTitleVisualKey(
    conversationKey,
    title,
    projectName,
    loadingTitle,
  )
  const exitTransition = {
    duration: CONVERSATION_MOTION.title.exitDuration,
    ease: CONVERSATION_MOTION.ease,
  }

  return (
    <h1 className="relative flex min-w-0 flex-1 items-center text-sm font-medium text-foreground">
      <span className="sr-only">{accessibleTitle}</span>
      <span
        aria-hidden="true"
        className="relative flex min-w-0 flex-1 items-center overflow-hidden"
      >
        <span className="invisible flex min-w-0 flex-1 items-center gap-2">
          <TitleCopy loadingTitle={loadingTitle} projectName={projectName} title={title} />
        </span>
        <AnimatePresence initial={false}>
          <motion.span
            key={visualKey}
            initial={false}
            exit={{
              opacity: 0,
              transition: exitTransition,
            }}
            className="absolute inset-0 flex min-w-0 items-center gap-2 overflow-hidden"
          >
            <TitleVisual
              loadingTitle={loadingTitle}
              projectName={projectName}
              reduce={reduce}
              title={title}
            />
          </motion.span>
        </AnimatePresence>
      </span>
    </h1>
  )
}
