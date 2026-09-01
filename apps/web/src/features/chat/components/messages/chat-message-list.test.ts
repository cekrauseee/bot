import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { ChatMessageList } from './chat-message-list'
import type { ChatMessage } from '../../model'

vi.stubGlobal('React', React)
afterAll(() => vi.unstubAllGlobals())

const failed: ChatMessage = {
  id: 'assistant', role: 'assistant', status: 'error', blocks: [], errorMessage: 'Service unavailable.',
}
const retry = () => {}

describe('retry action continuity', () => {
  it('keeps the deferred error busy across server identity reconciliation', () => {
    const markup = renderToStaticMarkup(React.createElement(ChatMessageList, {
      messages: [{ ...failed, id: 'server-id-before-retry', renderKey: 'visible-response' }],
      onRetryTurn: retry, canRetryTurn: false, retryingMessageKey: 'visible-response',
    }))
    expect(markup).toContain('Service unavailable.')
    expect(markup).toContain('Retrying…')
    expect(markup).toContain('aria-busy="true"')
  })

  it('keeps Retry response while a deferred transcript temporarily disables interaction', () => {
    const markup = renderToStaticMarkup(React.createElement(ChatMessageList, {
      messages: [failed], onRetryTurn: retry, onReloadConversation: retry, canRetryTurn: false,
    }))
    expect(markup).toContain('Retry response')
    expect(markup).not.toContain('Reload conversation')
    expect(markup).toContain('disabled=""')
  })

  it('uses reload only when a response cannot be retried', () => {
    for (const props of [
      { messages: [failed], onRetryTurn: undefined },
      { messages: [{ ...failed, retryable: false }], onRetryTurn: retry },
    ]) {
      const markup = renderToStaticMarkup(React.createElement(ChatMessageList, {
        ...props, onReloadConversation: retry, canRetryTurn: true,
      }))
      expect(markup).toContain('Reload conversation')
      expect(markup).not.toContain('Retry response')
    }
  })
})
