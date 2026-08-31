import { useState } from 'react'
import { nextSubmittedTurn, type SubmittedTurn } from '../motion/submitted-turn'

export function useSubmittedTurn(current: Omit<SubmittedTurn, 'anchorMessageKey'>) {
  const [previous, setPrevious] = useState<SubmittedTurn>(current)
  if (previous.conversationKey !== current.conversationKey ||
    previous.submissionId !== current.submissionId || previous.messageKey !== current.messageKey) {
    const next = nextSubmittedTurn(previous, current)
    setPrevious(next)
    return next.anchorMessageKey
  }
  return previous.anchorMessageKey
}
