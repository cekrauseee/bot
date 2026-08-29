import { describe, expect, it, vi } from 'vitest'
import type { Conversation, Message } from '../src/db/repository.js'
import {
  conversationTitle,
  parseProviderEvents,
  streamTurn,
  type AiClient,
  type TurnOptions,
} from '../src/modules/conversations.js'

const turnId = '00000000-0000-4000-8000-000000000001'
const conversation: Conversation = {
  id: '00000000-0000-4000-8000-000000000002',
  userId: '00000000-0000-4000-8000-000000000003',
  title: 'Hello there',
  createdAt: new Date('2026-08-28T12:00:00Z'),
  updatedAt: new Date('2026-08-28T12:00:00Z'),
}

const message = (
  id: string,
  role: 'user' | 'assistant',
  content: string,
  status: string,
): Message => ({
  id,
  conversationId: conversation.id,
  role,
  content,
  reasoning: null,
  status,
  errorMessage: null,
  model: role === 'assistant' ? 'gpt-5.6-sol' : null,
  reasoningEffort: role === 'assistant' ? 'medium' : null,
  speed: role === 'assistant' ? 'standard' : null,
  activities: [],
  createdAt: new Date('2026-08-28T12:00:00Z'),
  updatedAt: new Date('2026-08-28T12:00:00Z'),
})

const created = {
  user: message('00000000-0000-4000-8000-000000000004', 'user', 'Latest question', 'completed'),
  assistant: message('00000000-0000-4000-8000-000000000005', 'assistant', '', 'streaming'),
}

const options: TurnOptions = {
  message: 'Latest question',
  model: 'gpt-5.6-sol',
  reasoning_effort: 'medium',
  speed: 'standard',
}

const providerFrame = (
  sequence: number,
  type: string,
  data: Record<string, unknown>,
) => {
  const payload = { version: 1, sequence, turn_id: turnId, type, data }
  return `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`
}

const chunkedResponse = (body: string, cuts = [7, 19, 41]) => new Response(
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
  { status: 200, headers: { 'content-type': 'text/event-stream' } },
)

const publicEvents = async (response: Response) => {
  const parsed = parseProviderEvents(await response.text())
  expect(parsed.remainder).toBe('')
  return parsed.events
}

const store = () => {
  const updateAssistant = vi.fn().mockResolvedValue(created.assistant)
  return {
    repository: {
      transcript: vi.fn().mockResolvedValue([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
        { role: 'user', content: 'Latest question' },
      ]),
      updateAssistant,
    },
    updateAssistant,
  }
}

describe('conversation streaming protocol', () => {
  it('derives a compact first-message title', () => {
    expect(conversationTitle('  A   useful\nconversation title  ')).toBe(
      'A useful conversation title',
    )
    expect(conversationTitle('   ')).toBe('New conversation')
  })

  it('parses CRLF and multiline SSE data while retaining incomplete chunks', () => {
    const payload = JSON.stringify({
      version: 1,
      sequence: 1,
      turn_id: turnId,
      type: 'text.delta',
      data: { delta: 'Hello' },
    }, null, 2)
    const block = `event: text.delta\r\n${payload.split('\n').map((line) => `data: ${line}`).join('\r\n')}\r\n\r\npartial`
    const parsed = parseProviderEvents(block)
    expect(parsed.events).toHaveLength(1)
    expect(parsed.events[0].data).toEqual({ delta: 'Hello' })
    expect(parsed.remainder).toBe('partial')
  })

  it('reconciles once, forwards deltas, and persists normalized output', async () => {
    const state = store()
    let aiInput: Record<string, unknown> | undefined
    const ai: AiClient = async (input) => {
      aiInput = input
      return chunkedResponse([
        providerFrame(1, 'turn.started', { model: options.model }),
        providerFrame(2, 'reasoning.delta', { delta: 'Checking sources.' }),
        providerFrame(3, 'step.started', {
          step: {
            id: 'search-1', kind: 'web_search', status: 'in_progress',
            label: 'Web search', query: 'latest information',
          },
        }),
        providerFrame(4, 'step.completed', {
          step: {
            id: 'search-1', kind: 'web_search', status: 'completed',
            label: 'Web search', query: 'latest information',
            sources: [{ title: 'Source', url: 'https://example.com/source' }],
          },
        }),
        providerFrame(5, 'text.delta', { delta: 'Final answer.' }),
        providerFrame(6, 'turn.completed', { model: options.model }),
      ].join(''))
    }
    const response = await streamTurn(
      state.repository,
      conversation,
      conversation.userId,
      turnId,
      options,
      ai,
      new Request('http://localhost/turn'),
      created,
    )
    const events = await publicEvents(response)

    expect(events.filter((event) => event.type === 'turn.started')).toHaveLength(1)
    expect(events.map((event) => event.type)).toEqual([
      'turn.started',
      'reasoning.delta',
      'step.started',
      'step.completed',
      'text.delta',
      'turn.completed',
    ])
    expect(aiInput).toMatchObject({
      model: 'gpt-5.6-sol',
      reasoning_effort: 'medium',
      speed: 'standard',
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
        { role: 'user', content: 'Latest question' },
      ],
    })
    expect(state.updateAssistant).toHaveBeenLastCalledWith(created.assistant.id, {
      content: 'Final answer.',
      reasoning: 'Checking sources.',
      activities: [{
        id: 'search-1',
        type: 'search',
        query: 'latest information',
        results: [{
          id: 'search-1-0',
          title: 'Source',
          domain: 'example.com',
          url: 'https://example.com/source',
        }],
      }],
      status: 'completed',
      errorMessage: null,
    })
    expect(events[0].data).toMatchObject({
      conversation: { id: conversation.id, title: conversation.title },
      user_message: { id: created.user.id, role: 'user' },
      assistant_message: { id: created.assistant.id, role: 'assistant' },
    })
  })

  it.each([
    ['truncated', providerFrame(1, 'text.delta', { delta: 'Partial' })],
    [
      'out of order',
      providerFrame(2, 'text.delta', { delta: 'Partial' }) +
        providerFrame(2, 'turn.completed', {}),
    ],
    ['malformed', 'event: text.delta\ndata: {not-json}\n\n'],
  ])('fails and preserves partial output for a %s provider stream', async (_name, body) => {
    const state = store()
    const response = await streamTurn(
      state.repository,
      conversation,
      conversation.userId,
      turnId,
      options,
      async () => chunkedResponse(body),
      new Request('http://localhost/turn'),
      created,
    )
    const events = await publicEvents(response)
    expect(events.at(-1)?.type).toBe('turn.failed')
    expect(events.some((event) => event.type === 'turn.completed')).toBe(false)
    expect(state.updateAssistant).toHaveBeenLastCalledWith(
      created.assistant.id,
      expect.objectContaining({ status: 'failed' }),
    )
  })

  it('propagates one safe provider failure terminal', async () => {
    const state = store()
    const response = await streamTurn(
      state.repository,
      conversation,
      conversation.userId,
      turnId,
      options,
      async () => chunkedResponse(providerFrame(1, 'turn.failed', {
        error: { code: 'rate_limited', message: 'Try again later.', retryable: true },
      })),
      new Request('http://localhost/turn'),
      created,
    )
    const events = await publicEvents(response)
    expect(events.filter((event) => event.type === 'turn.failed')).toHaveLength(1)
    expect(events.at(-1)?.data).toEqual({
      error: { code: 'rate_limited', message: 'Try again later.', retryable: true },
    })
  })
})
