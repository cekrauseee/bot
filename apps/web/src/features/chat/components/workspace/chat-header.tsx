import { Folder, PanelLeft } from 'lucide-react'

import { AnimatedSidebarTrigger } from '@/components/motion/animated-sidebar'
import { cn } from '@/lib/utils'

export function ChatHeader({
  title,
  projectName,
  mobileOnly = false,
}: {
  title: string
  projectName?: string
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
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {projectName ? (
            <>
              <span
                className="inline-flex max-w-28 shrink-0 items-center gap-1.5 text-xs text-muted-foreground sm:max-w-48"
                title={projectName}
              >
                <Folder aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={1.5} />
                <span className="truncate">{projectName}</span>
              </span>
              <span aria-hidden="true" className="text-xs text-border">/</span>
            </>
          ) : null}
          <h1 className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
            {title}
          </h1>
        </div>
      ) : null}
    </header>
  )
}
