export type SubmittedTurn = {
  conversationKey: string
  submissionId?: string
  messageKey?: string
  anchorMessageKey?: string
}

/** Only a new send in this view can request an anchor; cached history cannot. */
export function nextSubmittedTurn(previous: SubmittedTurn, current: Omit<SubmittedTurn, 'anchorMessageKey'>): SubmittedTurn {
  const sameView = previous.conversationKey === current.conversationKey
  const startingConversation = previous.conversationKey === 'new' &&
    current.conversationKey === `new:${current.submissionId}`
  const newMessage = current.submissionId && current.submissionId !== previous.submissionId &&
    current.messageKey !== previous.messageKey
  return {
    ...current,
    anchorMessageKey: newMessage && (sameView || startingConversation)
      ? current.messageKey
      : sameView && previous.anchorMessageKey === current.messageKey
        ? previous.anchorMessageKey
        : undefined,
  }
}
