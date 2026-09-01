import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Settings } from '../src/config.js'
import {
  conversationTitle,
  createAiClient,
} from '../src/modules/conversations.js'

describe('conversation service primitives', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('derives a compact first-message title', () => {
    expect(conversationTitle('  A   useful\nconversation title  ')).toBe(
      'A useful conversation title',
    )
    expect(conversationTitle('   ')).toBe('New conversation')
  })

  it('calls the private AI boundary with the service token', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('ok'))
    vi.stubGlobal('fetch', fetch)
    const settings = {
      aiBaseUrl: 'http://ai.internal:8001',
      aiServiceToken: 'private-token',
    } as Settings
    const input = { version: 2, run_id: 'run-1' }

    await createAiClient(settings)(input, new AbortController().signal, {
      'x-request-id': 'request-1',
      'x-correlation-id': 'correlation-1',
    })

    expect(fetch).toHaveBeenCalledWith('http://ai.internal:8001/agent/stream', {
      method: 'POST',
      signal: expect.any(AbortSignal),
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer private-token',
        'x-request-id': 'request-1',
        'x-correlation-id': 'correlation-1',
      },
      body: JSON.stringify(input),
    })
  })
})
