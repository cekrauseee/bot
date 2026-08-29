import { PanelLeft } from 'lucide-react'

import { AnimatedSidebarTrigger } from '@/components/motion/animated-sidebar'
import { cn } from '@/lib/utils'

export function ChatHeader({
  title,
  mobileOnly = false,
}: {
  title: string
  mobileOnly?: boolean
}) {
  return (
    <header
      className={cn(
        'flex min-h-14 shrink-0 items-center gap-3 px-4 py-2.5 sm:px-6',
        mobileOnly
          ? 'pointer-events-none absolute inset-x-0 top-0 z-10 border-0 md:hidden'
          : 'border-b border-border/60',
      )}
    >
      <AnimatedSidebarTrigger
        aria-label="Toggle sidebar"
        className="pointer-events-auto size-9 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
      >
        <PanelLeft aria-hidden="true" className="size-4" />
      </AnimatedSidebarTrigger>
      {!mobileOnly ? (
        <h1 className="min-w-0 truncate text-sm font-medium text-foreground">
          {title}
        </h1>
      ) : null}
    </header>
  )
}
