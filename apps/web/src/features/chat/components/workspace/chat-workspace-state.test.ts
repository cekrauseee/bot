import { describe, expect, it } from 'vitest'

import { chatWorkspaceMode } from './chat-workspace-state'

describe('chat workspace mode', () => {
  it('centers a new conversation', () => {
    expect(chatWorkspaceMode({
      messageCount: 0,
      streaming: false,
      turnError: '',
    })).toBe('centered')
  })

  it.each([
    { messageCount: 2, streaming: true, turnError: '' },
    { messageCount: 0, streaming: true, turnError: '' },
    { messageCount: 0, streaming: false, turnError: 'Unable to send.' },
  ])('keeps unconfirmed activity and failures in the base composer: %o', (input) => {
    expect(chatWorkspaceMode(input)).toBe('centered')
  })

  it('keeps an existing empty conversation in transcript mode', () => {
    expect(chatWorkspaceMode({
      activeConversationId: 'conversation-id',
      messageCount: 0,
      streaming: false,
      turnError: '',
    })).toBe('transcript')
  })
})
