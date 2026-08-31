import { hasResponseProgress, type StreamEvent } from '../services/conversation-api'

/** Keep initial refusals in the composer, including failures in the same SSE batch as progress. */
export function createNewConversationGate(accept: (id: string) => void, cancelled: () => boolean) {
  let id: string | undefined
  let failed = false
  let accepted = false
  let queued = false
  return (event: StreamEvent) => {
    if (event.type === 'turn.started') id = event.data.conversation.id
    if (event.type === 'turn.failed') failed = true
    const progressed = hasResponseProgress(event)
    if (!id || !progressed || accepted || queued) return
    queued = true
    queueMicrotask(() => {
      queued = false
      if (!id || failed || accepted || cancelled()) return
      accepted = true
      accept(id)
    })
  }
}
