import { PanelLeft } from 'lucide-react'

import { AnimatedSidebarTrigger } from '@/components/motion/animated-sidebar'

export function ChatHeader({ title }: { title: string }) {
  return (
    <header className="flex min-h-14 shrink-0 items-center gap-3 border-b border-border/60 px-4 py-2.5 sm:px-6">
      <AnimatedSidebarTrigger
        aria-label="Toggle sidebar"
        className="size-9 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <PanelLeft aria-hidden="true" className="size-4" />
      </AnimatedSidebarTrigger>
      <h1 className="min-w-0 truncate text-sm font-medium text-foreground">
        {title}
      </h1>
    </header>
  )
}
