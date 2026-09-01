import { describe, expect, it } from 'vitest'
import { nextSubmittedTurn, type SubmittedTurn } from './submitted-turn'

describe('submitted turn anchor intent', () => {
  const idle: SubmittedTurn = { conversationKey: 'existing:A', messageKey: 'old-user' }
  const sent = { conversationKey: 'existing:A', submissionId: 'send-1', messageKey: 'pending-user-1' }

  it('anchors a new send but not initially loaded history', () => {
    expect(nextSubmittedTurn(idle, sent).anchorMessageKey).toBe('pending-user-1')
    expect(nextSubmittedTurn({ conversationKey: 'existing:A' }, idle).anchorMessageKey).toBeUndefined()
  })

  it('keeps the first send through the new-conversation handoff', () => {
    const first = { conversationKey: 'new:send-1', submissionId: 'send-1', messageKey: 'pending-user-1' }
    const anchor = nextSubmittedTurn({ conversationKey: 'new' }, first)
    expect(anchor.anchorMessageKey).toBe(first.messageKey)
    expect(nextSubmittedTurn(anchor, first).anchorMessageKey).toBe(first.messageKey)
  })

  it('does not recreate an anchor when reopening a cached conversation', () => {
    const anchor = nextSubmittedTurn(idle, sent)
    const other = nextSubmittedTurn(anchor, { conversationKey: 'existing:B', messageKey: 'user-B', submissionId: 'send-B' })
    expect(other.anchorMessageKey).toBeUndefined()
    expect(nextSubmittedTurn(other, sent).anchorMessageKey).toBeUndefined()
  })

  it('does not treat a retry of an old message as a new send', () => {
    expect(nextSubmittedTurn({ ...sent }, { ...sent, submissionId: 'retry-1' }).anchorMessageKey).toBeUndefined()
  })

  it('replaces the request for the next send and clears it on a history reload', () => {
    const anchor = nextSubmittedTurn(idle, sent)
    const second = nextSubmittedTurn(anchor, { ...sent, submissionId: 'send-2', messageKey: 'pending-user-2' })
    expect(second.anchorMessageKey).toBe('pending-user-2')
    expect(nextSubmittedTurn(second, { ...second, messageKey: 'persisted-user-2' }).anchorMessageKey).toBeUndefined()
  })
})
