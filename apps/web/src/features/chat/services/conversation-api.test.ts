import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  ConversationApiError,
  loadConversationDetail,
  mapApiMessage,
  parseSseBuffer,
  readEventStream,
  startConversationTurn,
} from './conversation-api'

const turnId = '00000000-0000-4000-8000-000000000001'
const frame = (sequence: number, type: string, data: Record<string, unknown>) =>
  `event: ${type}\ndata: ${JSON.stringify({
    version: 1,
    sequence,
    turn_id: turnId,
    type,
    data,
  })}\n\n`

const response = (body: string, cuts = [3, 11, 29]) => new Response(
  new ReadableStream<Uint8Array>({
    start(controller) {
      const bytes = new TextEncoder().encode(body)
      let offset = 0
      for (const size of cuts) {
        controller.enqueue(bytes.slice(offset, Math.min(bytes.length, offset + size)))
        offset += size
      }
      if (offset < bytes.length) controller.enqueue(bytes.slice(offset))
      controller.close()
    },
  }),
)

const startedFrame = () => frame(0, 'turn.started', {
  conversation: {
    id: 'conversation', title: 'Title', project_id: null,
    created_at: '2026-08-28T12:00:00.000Z',
    updated_at: '2026-08-28T12:00:00.000Z',
  },
  user_message: {
    id: 'user', role: 'user', content: 'Hi', reasoning: null,
    status: 'completed', error_message: null, model: null,
    reasoning_effort: null, speed: null, activities: [],
    created_at: '2026-08-28T12:00:00.000Z',
    updated_at: '2026-08-28T12:00:00.000Z',
  },
  assistant_message: {
    id: 'assistant', role: 'assistant', content: '', reasoning: null,
    status: 'streaming', error_message: null, model: 'gpt-5.6-sol',
    reasoning_effort: 'medium', speed: 'standard', activities: [],
    created_at: '2026-08-28T12:00:00.001Z',
    updated_at: '2026-08-28T12:00:00.001Z',
  },
})

afterEach(() => vi.unstubAllGlobals())

describe('conversation transport', () => {
  it('restores the persisted processing duration from message timestamps', () => {
    const message = mapApiMessage({
      id: 'assistant',
      role: 'assistant',
      content: 'Final answer.',
      reasoning: 'Checked the request.',
      status: 'completed',
      error_message: null,
      model: 'gpt-5.6-sol',
      reasoning_effort: 'medium',
      speed: 'standard',
      activities: [],
      created_at: '2026-08-29T12:00:00.000Z',
      updated_at: '2026-08-29T12:00:18.000Z',
    })

    expect(message.processDuration).toBe(18)
    expect(message.createdAt).toBe('2026-08-29T12:00:00.000Z')
  })

  it('keeps process timing without inventing a disclosure step', () => {
    const message = mapApiMessage({
      id: 'assistant', role: 'assistant', content: 'A concise answer.', reasoning: null,
      status: 'completed', error_message: null, model: 'gpt-5.6-luna',
      reasoning_effort: 'low', speed: 'fast', activities: [],
      created_at: '2026-08-29T12:00:00.000Z',
      updated_at: '2026-08-29T12:00:04.000Z',
    })

    expect(message.processDuration).toBe(4)
    expect(message.blocks).toEqual([{
      id: 'assistant-text',
      type: 'text',
      content: 'A concise answer.',
    }])
  })

  it('restores a persisted chronological process without duplicating reasoning', () => {
    const message = mapApiMessage({
      id: 'assistant', role: 'assistant', content: 'Final answer.',
      reasoning: 'Before search.After search.', status: 'completed',
      error_message: null, model: 'gpt-5.6-sol', reasoning_effort: 'high',
      speed: 'standard',
      activities: [
        { id: 'reasoning-1', type: 'text', content: 'Before search.', lastSequence: 1 },
        { id: 'search', type: 'search', query: 'current source' },
        { id: 'reasoning-4', type: 'text', content: 'After search.', lastSequence: 4 },
      ],
      created_at: '2026-08-29T12:00:00.000Z',
      updated_at: '2026-08-29T12:00:05.000Z',
    })

    expect(message.blocks).toEqual([
      {
        id: 'assistant-activity', type: 'activity', status: 'complete',
        items: [
          { id: 'reasoning-1', type: 'text', content: 'Before search.', lastSequence: 1 },
          { id: 'search', type: 'search', query: 'current source' },
          { id: 'reasoning-4', type: 'text', content: 'After search.', lastSequence: 4 },
        ],
      },
      { id: 'assistant-text', type: 'text', content: 'Final answer.' },
    ])
  })

  it('parses CRLF, multiline JSON, and incomplete chunks', () => {
    const payload = JSON.stringify({
      version: 1,
      sequence: 0,
      turn_id: turnId,
      type: 'text.delta',
      data: { delta: 'Hello' },
    }, null, 2)
    const input = `event: text.delta\r\n${payload.split('\n').map((line) => `data: ${line}`).join('\r\n')}\r\n\r\npartial`
    const parsed = parseSseBuffer(input)
    expect(parsed.events).toHaveLength(1)
    expect(parsed.events[0].data).toEqual({ delta: 'Hello' })
    expect(parsed.remainder).toBe('partial')
  })

  it('requires a strictly ordered terminal stream', async () => {
    await expect(readEventStream(response(
      startedFrame() + frame(1, 'text.delta', { delta: 'Hello' }),
    ), () => undefined)).rejects.toThrow(/before completion/)
    await expect(readEventStream(response(
      startedFrame() + frame(0, 'turn.completed', {}),
    ), () => undefined)).rejects.toThrow(/invalid/)

    const seen: string[] = []
    await readEventStream(response(
      startedFrame() + frame(1, 'turn.completed', {}),
    ), (event) => seen.push(event.type))
    expect(seen).toEqual(['turn.started', 'turn.completed'])
  })

  it('preserves the HTTP status on API failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ detail: 'Conversation not found.' }),
      { status: 404, headers: { 'content-type': 'application/json' } },
    )))

    const error = await loadConversationDetail('missing').catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ConversationApiError)
    expect(error).toMatchObject({ status: 404, message: 'Conversation not found.' })
  })

  it('posts to the synchronously captured rendered conversation ID', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(''))
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()

    await startConversationTurn('B', {
      message: 'Prompt for B',
      model: 'gpt-5.6-sol',
      reasoning_effort: 'medium',
      speed: 'standard',
    }, controller.signal)

    expect(fetchMock).toHaveBeenCalledOnce()
    const [request] = fetchMock.mock.calls[0]!
    const requestUrl = request instanceof Request ? request.url : String(request)
    expect(new URL(requestUrl, 'https://api.example.test').pathname)
      .toBe('/conversations/B/turns')
  })
})
