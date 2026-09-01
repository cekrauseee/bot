import type { ConversationSummary } from '../model'

export const isConversationPinned = (conversation: ConversationSummary) =>
  conversation.pinned_order != null

export const pinnedConversations = (conversations: ConversationSummary[]) =>
  conversations.filter(isConversationPinned).sort((left, right) =>
    left.pinned_order! - right.pinned_order! || left.id.localeCompare(right.id))

/** Pin changes have their own clock; chat activity must not reset the pin order. */
export function mergeConversationPin(current: ConversationSummary | undefined, incoming: ConversationSummary) {
  if (!current || !current.pin_updated_at ||
      (incoming.pin_updated_at && Date.parse(incoming.pin_updated_at) >= Date.parse(current.pin_updated_at))) {
    return incoming
  }
  return { ...incoming, pinned_order: current.pinned_order, pin_updated_at: current.pin_updated_at }
}
