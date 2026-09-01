import type { StreamEvent } from '../services/conversation-api'

export const shouldNavigateInitialHandoff = (
  renderedConversationId: string | undefined,
  mounted: boolean,
) => mounted && renderedConversationId === undefined

/** Make the durable conversation addressable as soon as the server publishes its identity. */
export function createNewConversationGate(accept: (id: string) => void) {
  let accepted = false
  return (event: StreamEvent) => {
    if (accepted || event.type !== 'turn.started' || !('conversation' in event.data)) return
    accepted = true
    accept(event.data.conversation.id)
  }
}
