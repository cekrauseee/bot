import { CircleAlert, Loader2, RotateCcw } from 'lucide-react'

import { Button } from '@/components/motion/button/base'
import { ActionSwapIcon, ActionSwapText } from '@/components/motion/action-swap'
import { Tooltip } from '@/components/motion/tooltip'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { cn } from '@/lib/utils'

export function CatalogFeedback({ pending, onRetry }: { pending: boolean; onRetry: () => void }) {
  return (
    <div data-scroll-boundary className="px-1 py-1">
      <Empty
        data-state={pending ? 'loading' : 'error'}
        className={cn(
          'flex-none flex-row gap-2.5 rounded-xl border border-solid p-3 text-start text-wrap transition-[background-color,border-color] motion-reduce:transition-none',
          pending ? 'border-border/70 bg-muted/20' : 'border-destructive/20 bg-destructive/5',
        )}
      >
        <EmptyMedia className={cn('mb-0 size-4 transition-colors duration-150 motion-reduce:transition-none', pending ? 'text-muted-foreground' : 'text-destructive')}>
          <ActionSwapIcon value={pending ? 'loading' : 'error'} className="size-4">
          {pending
            ? <Loader2 aria-hidden="true" className="size-4 motion-safe:animate-spin" />
            : <CircleAlert aria-hidden="true" className="size-4" />}
          </ActionSwapIcon>
        </EmptyMedia>
        <EmptyHeader className="min-h-8 min-w-0 flex-1 items-start justify-center gap-0" aria-live="polite">
          <EmptyTitle className="w-full min-w-0 text-xs leading-4 tracking-normal">
            <ActionSwapText
              value={pending ? 'loading' : 'error'}
              className="block w-full whitespace-normal [&>span]:whitespace-normal [&>span]:text-clip"
            >
              {pending ? 'Loading conversations…' : 'Couldn’t load conversations'}
            </ActionSwapText>
          </EmptyTitle>
        </EmptyHeader>
        <Tooltip content="Try again" disabled={pending} wrapperClassName="shrink-0">
          <Button
            variant="outline"
            size="icon"
            pressScale={0.96}
            disabled={pending}
            aria-label="Retry loading conversations"
            onClick={onRetry}
            className={cn(
              'size-7 shrink-0 rounded-lg outline-none transition-[color,background-color,border-color,opacity] duration-150 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none',
              !pending && 'border-destructive/20 text-destructive hover:bg-destructive/10 hover:text-destructive',
            )}
          >
            <RotateCcw aria-hidden="true" className="size-3.5" />
          </Button>
        </Tooltip>
      </Empty>
    </div>
  )
}
