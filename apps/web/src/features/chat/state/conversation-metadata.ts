import type { ConversationSummary } from '../model'
import { mergeConversationPin } from './pinned-conversations'

export function mergeConversationMetadata(current: ConversationSummary | undefined, incoming: ConversationSummary) {
  const merged = mergeConversationPin(current, incoming)
  if (!current?.title_updated_at ||
    (incoming.title_updated_at && Date.parse(incoming.title_updated_at) >= Date.parse(current.title_updated_at))) return merged
  return { ...merged, title: current.title, title_updated_at: current.title_updated_at }
}
