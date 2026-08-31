import { motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useState } from 'react'
import { LoadingTransition } from '@/components/loading-transition'
import type { ChatMessage } from '../../model'
import { EASE_OUT } from '@/lib/ease'
import { ResponseError } from './response-error'
import { ResponseProcess } from './response-process'
import { isResponseProcessBlock } from './response-process-model'

/** One stable surface for pending, processing, and failure, including fast failures. */
type ResponseStatusProps = {
  message: ChatMessage
  onRetry?: () => void
  onReload?: () => void
  retryDisabled?: boolean
  retryPending?: boolean
}

export function ResponseStatus(props: ResponseStatusProps) {
  const [animateChanges] = useState(props.message.status === 'streaming' || props.message.status === 'error')
  if (!animateChanges) {
    return <ResponseProcess blocks={props.message.blocks.filter(isResponseProcessBlock)} duration={props.message.processDuration} />
  }
  return <AnimatedResponseStatus {...props} />
}

function AnimatedResponseStatus({ message, onRetry, onReload, retryDisabled, retryPending }: ResponseStatusProps) {
  const reduce = useReducedMotion() ?? false
  const blocks = message.blocks.filter(isResponseProcessBlock)
  const working = message.status === 'streaming'
  const startedAt = message.processStartedAt ?? 0
  const [revealedAt, setRevealedAt] = useState<number>()
  const [height, setHeight] = useState<number>()
  const measure = useCallback((node: HTMLDivElement | null) => {
    if (!node) return
    const observer = new ResizeObserver(() => setHeight(node.offsetHeight))
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (!working) return
    const timer = window.setTimeout(() => setRevealedAt(startedAt), 150)
    return () => window.clearTimeout(timer)
  }, [working, startedAt])
  const retrying = Boolean(retryPending || (working && message.retryError))
  const failed = message.status === 'error' || retrying
  const showProcess = blocks.length > 0 || (working && revealedAt === startedAt)
  const state = failed ? 'error' : showProcess ? 'process' : 'pending'

  return (
    <motion.div initial={false} animate={{ height: height ?? 'auto' }}
      transition={{ duration: reduce ? 0 : 0.18, ease: EASE_OUT }} className="-mx-1.5 min-w-0 self-stretch overflow-hidden px-1.5">
      <div ref={measure}>
        <LoadingTransition stateKey={state}>
          {failed ? (
            <div className="flex min-w-0 flex-col gap-3">
              <ResponseError message={message.retryError ?? message.errorMessage ?? ''} onRetry={onRetry ?? onReload}
                retryLabel={onRetry ? 'Retry response' : 'Reload conversation'} disabled={retryDisabled} retrying={retrying}
                retryFailed={Boolean(onRetry) && message.status === 'error' && message.retryAttempted} />
              {blocks.length > 0 ? <ResponseProcess blocks={blocks} duration={message.processDuration} /> : null}
            </div>
          ) : showProcess ? (
            <ResponseProcess blocks={blocks} activeLabel={message.processLabel} duration={message.processDuration} />
          ) : working ? <div className="h-7" aria-hidden="true" /> : null}
        </LoadingTransition>
      </div>
    </motion.div>
  )
}
