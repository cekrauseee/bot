import { memo } from 'react'
import { ArrowUp, Square } from 'lucide-react'
import { StatefulButton } from '@/components/motion/button/stateful'
import { cn } from '@/lib/utils'

export type ComposerActionLabels = {
  send: string
  starting: string
  stop: string
  cancel: string
  retry: string
}

const defaultLabels: ComposerActionLabels = {
  send: 'Send prompt', starting: 'Starting conversation', stop: 'Stop generating',
  cancel: 'Cancel request', retry: 'Try again',
}

/** One primary button instance for home, pending request, active response, and error. */
export const ComposerSubmitAction = memo(function ComposerSubmitAction({
  centered, loading, canSubmit, error, errorId, onStop, labels = defaultLabels,
}: {
  centered: boolean
  loading: boolean
  canSubmit: boolean
  error: string
  errorId: string
  onStop?: () => void
  labels?: ComposerActionLabels
}) {
  const stopping = loading && !centered
  return (
      <StatefulButton
        type={loading ? 'button' : 'submit'}
        onClick={loading ? onStop : undefined}
        size="sm"
        pressScale={0.96}
        state={loading ? 'loading' : error ? 'error' : 'idle'}
        errorTone="destructive"
        disableWhileLoading={false}
        disabled={loading ? !onStop : !canSubmit}
        loadingIcon={stopping ? <Square className="size-3 fill-current" /> : undefined}
        loadingIconKey={stopping ? 'stop' : 'starting'}
        aria-label={stopping ? labels.stop : loading ? labels.cancel : error ? labels.retry : labels.send}
        aria-description={loading && centered ? labels.starting : undefined}
        aria-describedby={error ? errorId : undefined}
        title={error || (loading && centered ? labels.cancel : undefined)}
        loadingText={null}
        errorText={labels.retry}
        icon={<ArrowUp className="size-3.5" />}
        className={cn('h-8 min-w-8 shrink-0 rounded-full text-xs disabled:opacity-100',
          error ? 'py-1 pl-1 pr-3' : 'p-1',
          !loading && !error && !canSubmit && 'bg-muted text-muted-foreground')}
      >
        {null}
      </StatefulButton>
  )
})
