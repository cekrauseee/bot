import type { ConversationSummary } from '@/features/chat/model'

export type ConversationGroup = {
  label: string
  conversations: ConversationSummary[]
}

const localDayNumber = (date: Date) =>
  Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000

export function groupConversations(
  conversations: ConversationSummary[],
  now = new Date(),
  locale?: string,
): ConversationGroup[] {
  const groups = new Map<string, ConversationSummary[]>()
  const today = localDayNumber(now)

  for (const conversation of conversations) {
    const updatedAt = new Date(conversation.updated_at)
    const age = Math.max(0, today - localDayNumber(updatedAt))
    const label = age === 0
      ? 'Today'
      : age === 1
        ? 'Yesterday'
        : age < 7
          ? 'Previous 7 days'
          : age < 30
            ? 'Previous 30 days'
            : updatedAt.toLocaleDateString(locale, { month: 'long', year: 'numeric' })
    const group = groups.get(label)
    if (group) group.push(conversation)
    else groups.set(label, [conversation])
  }

  return [...groups].map(([label, entries]) => ({
    label,
    conversations: entries,
  }))
}
