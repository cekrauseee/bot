import { CircleAlert, RotateCcw } from 'lucide-react'
import { StatefulButton } from '@/components/motion/button/stateful'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyMedia } from '@/components/ui/empty'
import { cn } from '@/lib/utils'
import { memo } from 'react'

export const ResponseError = memo(function ResponseError({ message, onRetry, disabled = false, retrying = false, retryFailed = false, title = 'Response failed', retryLabel = 'Retry response', loadingLabel = 'Retrying…', retryAgainLabel = 'Retry again' }: {
  message: string
  onRetry?: () => void
  disabled?: boolean
  retrying?: boolean
  retryFailed?: boolean
  title?: string
  retryLabel?: string
  loadingLabel?: string
  retryAgainLabel?: string
}) {
  return (
    <Empty className="@container block flex-none rounded-xl border border-solid border-border/70 bg-muted/20 p-3.5 text-start text-wrap">
      <div className={cn('grid w-full min-w-0 grid-cols-[1rem_minmax(0,1fr)] items-start gap-x-3 gap-y-2',
        onRetry && '@min-[28rem]:grid-cols-[1rem_minmax(0,1fr)_auto]')}>
        <EmptyMedia className="col-start-1 row-start-1 mt-0.5 mb-0 size-4 text-destructive">
          <CircleAlert aria-hidden="true" className="size-4" />
        </EmptyMedia>
        <EmptyHeader className="col-start-2 row-start-1 min-w-0 max-w-none items-start gap-0.5" role="alert">
          <EmptyTitle className="text-sm leading-5">{title}</EmptyTitle>
          <EmptyDescription className="text-xs leading-5 [overflow-wrap:anywhere]">
            {message || 'The response could not be completed. Please try again.'}
          </EmptyDescription>
        </EmptyHeader>
      {onRetry ? (
        <StatefulButton
          type="button" variant="outline" size="sm" onClick={onRetry} disabled={disabled}
          state={retrying ? 'loading' : retryFailed ? 'error' : 'idle'} loadingText={loadingLabel} errorText={retryAgainLabel}
          errorTone="destructive"
          contentClassName="gap-1"
          icon={<RotateCcw aria-hidden="true" className="size-3.5" />}
          className="col-start-2 row-start-2 justify-self-end self-center px-2.5 text-xs disabled:opacity-100 focus-visible:ring-inset @min-[28rem]:col-start-3 @min-[28rem]:row-start-1"
        >
          {retryLabel}
        </StatefulButton>
      ) : null}
      </div>
    </Empty>
  )
})
