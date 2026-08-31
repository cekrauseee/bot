import { PanelLeft, SquarePen } from 'lucide-react'

import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { ComposerSkeleton, ConversationTitleSkeleton, ConversationTranscriptSkeleton } from './conversation-skeleton'
import { ChatSidebarSkeleton } from './chat-sidebar-skeleton'

export function ChatShellSkeleton({
  status = 'Loading your workspace…',
  variant,
}: {
  status?: string
  variant: 'new' | 'conversation'
}) {
  const conversation = variant === 'conversation'

  return (
    <main className="flex min-h-svh bg-background" aria-busy="true">
      <p role="status" className="sr-only">{status}</p>
      <aside
        aria-hidden="true"
        className="hidden h-svh w-[17rem] shrink-0 flex-col overflow-hidden border-r border-border md:flex"
      >
        <div className="flex shrink-0 flex-col gap-2 px-3 pt-3 pb-2">
          <div className="relative flex h-10 w-full min-w-0 items-center">
            <span className="absolute inset-y-0 start-3.5 flex items-center whitespace-nowrap text-base font-semibold tracking-tight text-foreground">
              myBot
            </span>
          </div>
          <div className="flex min-h-9 w-full min-w-0 items-center gap-2.5 overflow-hidden rounded-xl px-3 text-left text-xs font-medium leading-4 text-muted-foreground">
            <span className="grid size-5 shrink-0 place-items-center">
              <SquarePen aria-hidden="true" className="size-4" />
            </span>
            <span className="min-w-0 flex-1 truncate">New conversation</span>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden overscroll-none px-3 py-2">
          <div className="relative min-h-0 flex-1">
            <ChatSidebarSkeleton />
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="flex min-h-9 w-full min-w-0 items-center gap-2.5 overflow-hidden rounded-xl px-3">
            <Skeleton className="size-5 shrink-0 rounded-md" />
            <Skeleton className="h-3.5 w-24" />
          </div>
        </div>
      </aside>
      <div className="relative flex h-svh min-w-0 flex-1 flex-col">
        <header
          className={cn(
            'flex min-h-14 shrink-0 items-center gap-3 px-4 py-2.5 sm:px-6',
            conversation
              ? ''
              : 'pointer-events-none absolute inset-x-0 top-0 z-10 border-0 md:hidden',
          )}
        >
          <span className="grid size-9 place-items-center rounded-xl text-muted-foreground md:hidden">
            <PanelLeft className="size-4" />
          </span>
          {conversation ? <ConversationTitleSkeleton /> : null}
        </header>
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          {conversation ? (
            <div className="min-h-0 flex-1">
              <ConversationTranscriptSkeleton />
            </div>
          ) : null}
          <div
            className={
              conversation
                ? 'relative -mt-4 shrink-0'
                : 'absolute inset-0 flex items-center justify-center pb-12'
            }
          >
            <ComposerSkeleton centered={!conversation} />
          </div>
        </div>
      </div>
    </main>
  )
}
