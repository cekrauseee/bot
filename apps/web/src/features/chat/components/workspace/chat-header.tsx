import { PanelLeft } from 'lucide-react'
import { motion } from 'motion/react'
import { usePageEntrance } from '@/lib/use-page-entrance'

import { AnimatedSidebarTrigger } from '@/components/motion/animated-sidebar'
import { cn } from '@/lib/utils'
import { ConversationTitle } from './conversation-title'
import { ScrollDivider } from '../shared/scroll-divider'

export function ChatHeader({
  title,
  conversationKey,
  loadingTitle = false,
  projectName,
  mobileOnly = false,
  scrolled = false,
}: {
  title: string
  conversationKey: string
  loadingTitle?: boolean
  projectName?: string
  mobileOnly?: boolean
  scrolled?: boolean
}) {
  const entrance = usePageEntrance(1)
  return (
    <motion.header
      {...entrance}
      className={cn(
        'relative flex min-h-14 shrink-0 items-center gap-3 px-4 py-2.5 sm:px-6',
        mobileOnly
          ? 'pointer-events-none absolute inset-x-0 top-0 z-10 border-0 md:hidden'
          : '',
      )}
    >
      <ScrollDivider visible={!mobileOnly && scrolled} />
      <AnimatedSidebarTrigger
        aria-label="Toggle sidebar"
        className="pointer-events-auto size-9 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
      >
        <PanelLeft aria-hidden="true" className="size-4" />
      </AnimatedSidebarTrigger>
      {!mobileOnly ? (
        <ConversationTitle
          conversationKey={conversationKey}
          loadingTitle={loadingTitle}
          projectName={projectName}
          title={title}
        />
      ) : null}
    </motion.header>
  )
}
