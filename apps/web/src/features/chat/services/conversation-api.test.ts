import { describe, expect, it } from 'vitest'

import {
  applyStreamEvent,
  initialConversationState,
  mapApiMessage,
  parseSseBuffer,
  readEventStream,
  type ConversationState,
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

describe('conversation SSE protocol', () => {
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
  })

  it('keeps a process disclosure for completed answers without reported reasoning', () => {
    const message = mapApiMessage({
      id: 'assistant',
      role: 'assistant',
      content: 'A concise answer.',
      reasoning: null,
      status: 'completed',
      error_message: null,
      model: 'gpt-5.6-luna',
      reasoning_effort: 'low',
      speed: 'fast',
      activities: [],
      created_at: '2026-08-29T12:00:00.000Z',
      updated_at: '2026-08-29T12:00:04.000Z',
    })

    expect(message.processDuration).toBe(4)
    expect(message.blocks[0]).toMatchObject({
      type: 'activity',
      items: [{ type: 'step', label: 'Generated the response' }],
    })
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
    const started = frame(0, 'turn.started', {
      conversation: {
        id: 'conversation', title: 'Title',
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
    await expect(readEventStream(response(
      started + frame(1, 'text.delta', { delta: 'Hello' }),
    ), () => undefined)).rejects.toThrow(/before completion/)
    await expect(readEventStream(response(
      started + frame(0, 'turn.completed', {}),
    ), () => undefined)).rejects.toThrow(/invalid/)

    const seen: string[] = []
    await readEventStream(response(
      started + frame(1, 'turn.completed', {}),
    ), (event) => seen.push(event.type))
    expect(seen).toEqual(['turn.started', 'turn.completed'])
  })

  it('reconciles optimistic IDs and applies deltas immutably', () => {
    const optimistic: ConversationState = {
      ...initialConversationState,
      loading: false,
      streaming: true,
      messages: [
        { id: 'pending-user', role: 'user', status: 'complete', blocks: [] },
        { id: 'pending-assistant', role: 'assistant', status: 'streaming', blocks: [] },
      ],
      activeAssistantId: 'pending-assistant',
    }
    const started = parseSseBuffer(frame(0, 'turn.started', {
      conversation: {
        id: 'conversation', title: 'Title',
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
    })).events[0]
    const reconciled = applyStreamEvent(optimistic, started)
    const delta = parseSseBuffer(frame(1, 'text.delta', { delta: '**Hello**' })).events[0]
    const streamed = applyStreamEvent(reconciled, delta)

    expect(optimistic.messages[1].blocks).toEqual([])
    expect(reconciled.messages.map((message) => message.id)).toEqual(['user', 'assistant'])
    expect(streamed.messages[1].blocks).toContainEqual({
      id: 'assistant-text',
      type: 'text',
      content: '**Hello**',
    })
  })

  it('updates the active process label and retires reasoning when final text starts', () => {
    const state: ConversationState = {
      ...initialConversationState,
      loading: false,
      streaming: true,
      activeAssistantId: 'assistant',
      messages: [{
        id: 'assistant',
        role: 'assistant',
        status: 'streaming',
        processLabel: 'Thinking…',
        processStartedAt: Date.now() - 5_000,
        blocks: [],
      }],
    }
    const event = (sequence: number, type: string, data: Record<string, unknown>) =>
      parseSseBuffer(frame(sequence, type, data)).events[0]

    const reasoning = applyStreamEvent(state, event(1, 'reasoning.delta', {
      delta: 'Checking sources.',
    }))
    expect(reasoning.messages[0].processLabel).toBe('Thinking…')

    const searching = applyStreamEvent(reasoning, event(2, 'step.started', {
      step: {
        id: 'search-1',
        kind: 'web_search',
        status: 'in_progress',
        label: 'Web search',
        query: 'current reference',
      },
    }))
    expect(searching.messages[0].processLabel).toBe('Searching the web…')

    const completedSearch = applyStreamEvent(searching, event(3, 'step.completed', {
      step: {
        id: 'search-1',
        kind: 'web_search',
        status: 'completed',
        label: 'Web search',
        query: 'current reference',
      },
    }))
    expect(completedSearch.messages[0].processLabel).toBe('Thinking…')

    const answering = applyStreamEvent(completedSearch, event(4, 'text.delta', {
      delta: 'Final answer.',
    }))
    expect(answering.messages[0].processLabel).toBeUndefined()
    expect(answering.messages[0].processStartedAt).toEqual(expect.any(Number))
    expect(answering.messages[0].processDuration).toBeGreaterThanOrEqual(5)
    expect(answering.messages[0].blocks).toContainEqual(expect.objectContaining({
      type: 'reasoning',
      status: 'complete',
    }))
    expect(answering.messages[0].blocks).toContainEqual(expect.objectContaining({
      type: 'activity',
      status: 'complete',
    }))
  })
})
