import { describe, expect, it, vi } from 'vitest'
import {
  createNewConversationGate,
  shouldNavigateInitialHandoff,
} from '../hooks/new-conversation-gate'

import type { ApiConversationMessage, ConversationSummary } from '../model'
import type { ConversationDetail, StreamEvent } from '../services/conversation-api'
import {
  conversationControllerReducer,
  conversationRouteIdentity,
  createOptimisticMessages,
  detailFailureStatus,
  initialConversationControllerState,
  selectActiveConversation,
  shouldLoadConversationDetail,
  type ConversationControllerState,
  type ConversationRouteIdentity,
} from './conversation-controller'

const at = Date.parse('2026-08-30T12:00:00.000Z')
const existing = (id: string): ConversationRouteIdentity => ({ kind: 'existing', id })
const summary = (id: string, projectId: string | null = null): ConversationSummary => ({
  id,
  title: `Conversation ${id}`,
  title_updated_at: null,
  project_id: projectId,
  pinned_order: null,
  pin_updated_at: null,
  created_at: '2026-08-30T10:00:00.000Z',
  updated_at: '2026-08-30T10:00:00.000Z',
})
const apiMessage = (
  id: string,
  role: 'user' | 'assistant',
  content: string,
  status = 'completed',
): ApiConversationMessage => ({
  id,
  role,
  content,
  reasoning: null,
  status,
  error_message: null,
  model: role === 'assistant' ? 'gpt-5.6-sol' : null,
  reasoning_effort: role === 'assistant' ? 'medium' : null,
  speed: role === 'assistant' ? 'standard' : null,
  activities: [],
  created_at: '2026-08-30T10:00:00.000Z',
  updated_at: '2026-08-30T10:00:01.000Z',
})
const detail = (id: string, content = id): ConversationDetail => ({
  ...summary(id),
  messages: [apiMessage(`${id}-user`, 'user', content)],
})
const started = (id: string): StreamEvent => ({
  version: 2,
  sequence: '0',
  run_id: `run-${id}`,
  turn_id: `turn-${id}`,
  type: 'turn.started',
  data: {
    conversation: summary(id),
    user_message: apiMessage(`${id}-user`, 'user', 'Prompt'),
    assistant_message: apiMessage(`${id}-assistant`, 'assistant', '', 'streaming'),
  },
})
const delta = (id: string, value: string): StreamEvent => ({
  version: 2,
  sequence: '1',
  run_id: `run-${id}`,
  turn_id: `turn-${id}`,
  type: 'text.delta',
  data: { delta: value },
})
const completed = (id: string): StreamEvent => ({
  version: 2,
  sequence: '2',
  run_id: `run-${id}`,
  turn_id: `turn-${id}`,
  type: 'turn.completed',
  data: {},
})
const failed = (id: string): StreamEvent => ({
  version: 2,
  sequence: '2',
  run_id: `run-${id}`,
  turn_id: `turn-${id}`,
  type: 'turn.failed',
  data: { error: { code: 'provider_error', message: 'Failed.', retryable: true } },
})
const reduce = (
  state: ConversationControllerState,
  action: Parameters<typeof conversationControllerReducer>[1],
) => conversationControllerReducer(state, action)

describe('conversation controller', () => {
  it('keeps the failed description until retry completion, including streamed progress', () => {
    let state = initialConversationControllerState()
    state = reduce(state, { type: 'turn.started', key: existing('A'), operationId: 'first',
      optimisticMessages: createOptimisticMessages('Prompt', 'first', at) })
    state = reduce(state, { type: 'turn.event', key: existing('A'), operationId: 'first', event: started('A'), at })
    state = reduce(state, { type: 'turn.event', key: existing('A'), operationId: 'first', event: failed('A'), at })
    state = reduce(state, { type: 'turn.started', key: existing('A'), operationId: 'retry', retryMessageId: 'A-assistant',
      optimisticMessages: createOptimisticMessages('Prompt', 'retry', at + 1000) })
    expect(state.conversationsById.A.messages.at(-1)).toMatchObject({ status: 'streaming', retryError: 'Failed.' })
    state = reduce(state, { type: 'turn.event', key: existing('A'), operationId: 'retry', event: started('A'), at })
    expect(state.conversationsById.A.messages.at(-1)?.retryError).toBe('Failed.')
    state = reduce(state, { type: 'turn.event', key: existing('A'), operationId: 'retry', event: delta('A', '  '), at })
    expect(state.conversationsById.A.messages.at(-1)?.retryError).toBe('Failed.')
    state = reduce(state, { type: 'turn.event', key: existing('A'), operationId: 'retry', event: delta('A', 'Answer'), at })
    expect(state.conversationsById.A.messages.at(-1)?.retryError).toBe('Failed.')
    state = reduce(state, { type: 'turn.event', key: existing('A'), operationId: 'retry', event: completed('A'), at })
    expect(state.conversationsById.A.messages.at(-1)?.retryError).toBeUndefined()
    expect(state.conversationsById.A.messages).toHaveLength(2)
  })

  it('keeps response processing active through text deltas and completes it with the turn', () => {
    let state = initialConversationControllerState()
    state = reduce(state, { type: 'turn.started', key: existing('A'), operationId: 'turn',
      optimisticMessages: createOptimisticMessages('Prompt', 'turn', at) })
    state = reduce(state, { type: 'turn.event', key: existing('A'), operationId: 'turn', event: started('A'), at })
    state = reduce(state, { type: 'turn.event', key: existing('A'), operationId: 'turn',
      event: delta('A', 'Answer'), at: at + 2_000 })

    expect(state.conversationsById.A.messages.at(-1)).toMatchObject({
      status: 'streaming',
      processStartedAt: at,
      processDuration: 2,
    })

    state = reduce(state, { type: 'turn.event', key: existing('A'), operationId: 'turn',
      event: completed('A'), at: at + 5_000 })
    expect(state.conversationsById.A.messages.at(-1)).toMatchObject({
      status: 'complete',
      processDuration: 5,
    })
    expect(state.conversationsById.A.messages.at(-1)?.processStartedAt).toBeUndefined()
  })

  it('applies a generated title without changing conversation recency', () => {
    let state = initialConversationControllerState()
    state = reduce(state, { type: 'catalog.load.started', operationId: 'catalog', refreshing: false })
    state = reduce(state, {
      type: 'catalog.load.succeeded', operationId: 'catalog', conversations: [summary('A')], projects: [],
    })
    state = reduce(state, { type: 'turn.started', key: existing('A'), operationId: 'turn',
      optimisticMessages: createOptimisticMessages('Prompt', 'turn', at) })
    state = reduce(state, { type: 'turn.event', key: existing('A'), operationId: 'turn', event: started('A'), at })
    const before = state.catalog.conversations[0].updated_at
    state = reduce(state, {
      type: 'run.event',
      key: existing('A'),
      at,
      event: {
        version: 2,
        sequence: '1',
        run_id: 'run-A',
        turn_id: 'turn-A',
        type: 'conversation.title.updated',
        data: {
          conversation: {
            ...summary('A'),
            title: 'Durable background runs',
            title_updated_at: '2026-08-30T12:00:01.000Z',
          },
        },
      },
    })

    expect(state.conversationsById.A.title).toBe('Durable background runs')
    expect(state.catalog.conversations[0]).toMatchObject({
      title: 'Durable background runs',
      title_updated_at: '2026-08-30T12:00:01.000Z',
      updated_at: before,
    })
  })

  it('merges parallel catalog snapshots by the title clock regardless of response order', () => {
    const current = {
      ...summary('A'),
      title: 'Generated title',
      title_updated_at: '2026-08-30T12:00:01.000Z',
    }
    const stale = { ...summary('A'), title: 'Original prompt' }
    let state = initialConversationControllerState()
    state = reduce(state, { type: 'catalog.load.started', operationId: 'catalog', refreshing: false })
    state = reduce(state, {
      type: 'catalog.load.succeeded',
      operationId: 'catalog',
      conversations: [current, stale],
      projects: [],
    })

    expect(state.catalog.conversations[0]).toMatchObject({
      title: 'Generated title',
      title_updated_at: current.title_updated_at,
    })
  })

  it('appends reasoning and searches in stream chronology', () => {
    let state = initialConversationControllerState()
    state = reduce(state, { type: 'turn.started', key: existing('A'), operationId: 'turn',
      optimisticMessages: createOptimisticMessages('Prompt', 'turn', at) })
    state = reduce(state, { type: 'turn.event', key: existing('A'), operationId: 'turn', event: started('A'), at })
    const event = (sequence: number, type: 'reasoning.delta' | 'step.started' | 'step.completed', data: Record<string, unknown>): StreamEvent => ({
      version: 2, sequence: String(sequence), run_id: 'run-A', turn_id: 'turn-A', type, data,
    } as StreamEvent)
    state = reduce(state, { type: 'turn.event', key: existing('A'), operationId: 'turn',
      event: event(1, 'reasoning.delta', { delta: 'Before search. ' }), at })
    state = reduce(state, { type: 'turn.event', key: existing('A'), operationId: 'turn',
      event: event(2, 'reasoning.delta', { delta: 'Still before search.' }), at })
    state = reduce(state, { type: 'turn.event', key: existing('A'), operationId: 'turn',
      event: event(3, 'step.started', { step: {
        id: 'search', kind: 'web_search', status: 'in_progress', label: 'Web search', query: 'current source',
      } }), at })
    state = reduce(state, { type: 'turn.event', key: existing('A'), operationId: 'turn',
      event: event(4, 'step.completed', { step: {
        id: 'search', kind: 'web_search', status: 'completed', label: 'Web search', query: 'current source',
      } }), at })
    state = reduce(state, { type: 'turn.event', key: existing('A'), operationId: 'turn',
      event: event(5, 'reasoning.delta', { delta: 'After search.' }), at })

    expect(state.conversationsById.A.messages.at(-1)?.blocks).toEqual([{
      id: 'A-assistant-activity', type: 'activity', status: 'working', items: [
        {
          id: 'A-assistant-reasoning-1', type: 'text',
          content: 'Before search. Still before search.', lastSequence: '2',
        },
        { id: 'search', type: 'search', query: 'current source', results: [] },
        {
          id: 'A-assistant-reasoning-5', type: 'text',
          content: 'After search.', lastSequence: '5',
        },
      ],
    }])
  })

  it('replaces the retained description on another failure without leaving a pending retry', () => {
    let state = initialConversationControllerState()
    state = reduce(state, { type: 'turn.started', key: { kind: 'new' }, operationId: 'first',
      optimisticMessages: createOptimisticMessages('Prompt', 'first', at) })
    state = reduce(state, { type: 'turn.failed', key: { kind: 'new' }, operationId: 'first',
      error: 'First failure', cancelled: false, at })
    const id = state.newConversation.messages.at(-1)!.id
    state = reduce(state, { type: 'turn.started', key: { kind: 'new' }, operationId: 'retry', retryMessageId: id,
      optimisticMessages: createOptimisticMessages('Prompt', 'retry', at + 1000) })
    state = reduce(state, { type: 'turn.failed', key: { kind: 'new' }, operationId: 'retry',
      error: 'Second failure', cancelled: false, at })
    expect(state.newConversation.messages.at(-1)).toMatchObject({ id, status: 'error', errorMessage: 'Second failure', retryAttempted: true })
    expect(state.newConversation.messages.at(-1)?.retryError).toBeUndefined()
  })
  it('keeps a refused first response in the base record and retains its server ID for retry', () => {
    let state = initialConversationControllerState()
    state = reduce(state, { type: 'turn.started', key: { kind: 'new' }, operationId: 'request',
      optimisticMessages: createOptimisticMessages('Prompt', 'draft', at) })
    state = reduce(state, { type: 'turn.event', key: { kind: 'new' }, operationId: 'request',
      event: started('server'), at, deferHandoff: true })
    expect(state.conversationsById.server).toBeUndefined()
    expect(state.newConversation.id).toBe('server')
    state = reduce(state, { type: 'turn.event', key: { kind: 'new' }, operationId: 'request',
      event: failed('server'), at })
    expect(state.newConversation.turn.error).toBe('Failed.')
    expect(reduce(state, { type: 'turn.handoff', operationId: 'request', id: 'server' })).toBe(state)
  })

  it('hands off once accepted, including a completed stream in the same batch', () => {
    let state = initialConversationControllerState()
    state = reduce(state, { type: 'turn.started', key: { kind: 'new' }, operationId: 'request',
      optimisticMessages: createOptimisticMessages('Prompt', 'draft', at) })
    state = reduce(state, { type: 'turn.event', key: { kind: 'new' }, operationId: 'request',
      event: started('server'), at, deferHandoff: true })
    const viewKey = state.newConversation.viewKey
    state = reduce(state, { type: 'turn.event', key: { kind: 'new' }, operationId: 'request',
      event: completed('server'), at })
    expect(reduce(state, { type: 'turn.handoff', operationId: 'stale', id: 'server' })).toBe(state)
    state = reduce(state, { type: 'turn.handoff', operationId: 'request', id: 'server' })
    expect(state.conversationsById.server.viewKey).toBe(viewKey)
    expect(state.conversationsById.server.turn.status).toBe('ready')
    expect(state.newConversation.messages).toEqual([])
  })

  it('does not accumulate local failed prompts when an edited request has no server conversation', () => {
    let state = initialConversationControllerState()
    for (const id of ['first', 'edited']) {
      state = reduce(state, { type: 'turn.started', key: { kind: 'new' }, operationId: id,
        optimisticMessages: createOptimisticMessages(id, id, at) })
      state = reduce(state, { type: 'turn.failed', key: { kind: 'new' }, operationId: id,
        error: 'Invalid request.', cancelled: false, at })
    }
    expect(state.newConversation.messages).toHaveLength(2)
    expect(state.newConversation.messages[0].blocks[0]).toMatchObject({ content: 'edited' })
  })
  it('preserves pane and message identities across a new-conversation handoff', () => {
    let state = initialConversationControllerState()
    state = reduce(state, {
      type: 'turn.started', key: { kind: 'new' }, operationId: 'send-new',
      input: { message: 'Prompt', model: 'gpt-5.6-sol', reasoning_effort: 'medium', speed: 'standard' },
      optimisticMessages: createOptimisticMessages('Prompt', 'visual', at),
    })
    const pending = state.newConversation
    state = reduce(state, {
      type: 'turn.event', key: { kind: 'new' }, operationId: 'send-new', event: started('server'), at,
    })
    expect(state.conversationsById.server.viewKey).toBe(pending.viewKey)
    expect(state.conversationsById.server.messages.map((message) => message.renderKey))
      .toEqual(pending.messages.map((message) => message.id))
  })

  it('retries a failed new prompt without adding another user message', () => {
    let state = initialConversationControllerState()
    const input = { message: 'Prompt', model: 'gpt-5.6-sol', reasoning_effort: 'medium', speed: 'standard' } as const
    state = reduce(state, {
      type: 'turn.started', key: { kind: 'new' }, operationId: 'first', input,
      optimisticMessages: createOptimisticMessages('Prompt', 'first', at),
    })
    state = reduce(state, {
      type: 'turn.failed', key: { kind: 'new' }, operationId: 'first',
      error: 'Connection unavailable.', cancelled: false, at,
    })
    const failedRecord = state.newConversation
    expect(failedRecord.messages.at(-1)?.errorMessage).toBe('Connection unavailable.')
    state = reduce(state, {
      type: 'turn.started', key: { kind: 'new' }, operationId: 'retry', input,
      retryMessageId: failedRecord.messages.at(-1)!.id,
      optimisticMessages: createOptimisticMessages('Prompt', 'retry', at + 1000),
    })
    expect(state.newConversation.messages).toHaveLength(2)
    expect(state.newConversation.messages[0]).toBe(failedRecord.messages[0])
    expect(state.newConversation.messages[1].id).toBe(failedRecord.messages[1].id)
    expect(state.newConversation.viewKey).toBe(failedRecord.viewKey)
    expect(state.newConversation.turn.status).toBe('loading')
    expect(state.newConversation.messages[1].errorMessage).toBeUndefined()
    expect(reduce(state, {
      type: 'turn.started', key: { kind: 'new' }, operationId: 'duplicate', input,
      retryMessageId: failedRecord.messages.at(-1)!.id,
      optimisticMessages: createOptimisticMessages('Prompt', 'duplicate', at + 1001),
    })).toBe(state)
  })

  it('restores the original retry settings for the last persisted failed response', () => {
    let state = initialConversationControllerState()
    state = reduce(state, { type: 'detail.load.started', id: 'A', operationId: 'load' })
    state = reduce(state, {
      type: 'detail.load.succeeded', id: 'A', operationId: 'load', detail: {
        ...detail('A'), messages: [
          apiMessage('question', 'user', 'Original prompt'),
          { ...apiMessage('answer', 'assistant', '', 'failed'), error_message: 'Provider unavailable.',
            model: 'gpt-5.6-luna', reasoning_effort: 'high', speed: 'fast' },
        ],
      },
    })
    expect(state.conversationsById.A.lastTurnInput).toEqual({
      message: 'Original prompt', model: 'gpt-5.6-luna', reasoning_effort: 'high', speed: 'fast',
    })
    expect(state.conversationsById.A.messages[1]).toMatchObject({
      status: 'error', errorMessage: 'Provider unavailable.', blocks: [],
    })
  })
  it('keeps catalog and keyed detail loads independent across A -> B -> A', () => {
    let state = initialConversationControllerState()
    state = reduce(state, { type: 'catalog.load.started', operationId: 'catalog', refreshing: false })
    state = reduce(state, {
      type: 'catalog.load.succeeded',
      operationId: 'catalog',
      conversations: [summary('A'), summary('B')],
      projects: [],
    })
    state = reduce(state, { type: 'detail.load.started', id: 'A', operationId: 'load-A' })
    state = reduce(state, { type: 'detail.load.started', id: 'B', operationId: 'load-B' })
    state = reduce(state, {
      type: 'detail.load.succeeded', id: 'B', operationId: 'load-B', detail: detail('B'),
    })
    const readyB = selectActiveConversation(state, existing('B'))

    state = reduce(state, {
      type: 'detail.load.succeeded', id: 'A', operationId: 'load-A', detail: detail('A'),
    })

    expect(selectActiveConversation(state, existing('B'))).toEqual(readyB)
    expect(selectActiveConversation(state, existing('A'))).toMatchObject({
      detail: { status: 'ready' },
      messages: [{ id: 'A-user' }],
    })
    expect(selectActiveConversation(state, existing('B')).messages[0].id).toBe('B-user')
    expect(selectActiveConversation(state, existing('A')).messages[0].id).toBe('A-user')
  })

  it('ignores every late A callback after A no longer owns the turn', () => {
    let state = initialConversationControllerState()
    state = reduce(state, {
      type: 'turn.started',
      key: existing('A'),
      operationId: 'turn-A',
      optimisticMessages: createOptimisticMessages('A prompt', 'A', at),
    })
    state = reduce(state, {
      type: 'turn.event', key: existing('A'), operationId: 'turn-A', event: started('A'), at,
    })
    state = reduce(state, {
      type: 'turn.aborted', key: existing('A'), operationId: 'turn-A', at: at + 1_000,
    })
    state = reduce(state, {
      type: 'detail.load.started', id: 'B', operationId: 'load-B',
    })
    state = reduce(state, {
      type: 'detail.load.succeeded', id: 'B', operationId: 'load-B', detail: detail('B'),
    })
    const beforeLateEvents = state

    for (const event of [delta('A', 'late'), completed('A'), failed('A')]) {
      state = reduce(state, {
        type: 'turn.event', key: existing('A'), operationId: 'turn-A', event, at: at + 2_000,
      })
      expect(state).toBe(beforeLateEvents)
    }
    state = reduce(state, {
      type: 'turn.failed',
      key: existing('A'),
      operationId: 'turn-A',
      error: 'late failure',
      cancelled: false,
      at: at + 2_000,
    })
    expect(state).toBe(beforeLateEvents)
    expect(selectActiveConversation(state, existing('B')).messages[0].id).toBe('B-user')
  })

  it('atomically rekeys a new turn and continues the same guarded operation', () => {
    let state = initialConversationControllerState()
    const optimistic = createOptimisticMessages('Prompt', 'new', at)
    state = reduce(state, {
      type: 'turn.started', key: { kind: 'new' }, operationId: 'turn-new', optimisticMessages: optimistic,
    })
    state = reduce(state, {
      type: 'turn.event',
      key: { kind: 'new' },
      operationId: 'turn-new',
      event: started('server-id'),
      at,
    })

    expect(state.newConversation).toMatchObject({
      title: 'New conversation',
      messages: [],
      detail: { status: 'ready' },
      turn: { status: 'idle' },
    })
    expect(state.conversationsById['server-id']).toMatchObject({
      id: 'server-id',
      detail: { status: 'ready' },
      turn: { status: 'loading', operationId: 'turn-new' },
      activeAssistantId: 'server-id-assistant',
    })

    state = reduce(state, {
      type: 'turn.event',
      key: existing('server-id'),
      operationId: 'turn-new',
      event: delta('server-id', 'Answer'),
      at: at + 1_000,
    })
    expect(state.conversationsById['server-id'].messages.at(-1)?.blocks).toContainEqual(
      expect.objectContaining({ type: 'text', content: 'Answer' }),
    )
    expect(conversationRouteIdentity(undefined)).toEqual({ kind: 'new' })
    expect(conversationRouteIdentity('server-id')).toEqual(existing('server-id'))
  })

  it('ignores stale operation IDs for all detail and turn terminal paths', () => {
    let state = initialConversationControllerState()
    state = reduce(state, { type: 'detail.load.started', id: 'A', operationId: 'current-load' })
    const loading = state
    const staleDetailActions = [
      { type: 'detail.load.succeeded', id: 'A', operationId: 'stale', detail: detail('A') },
      {
        type: 'detail.load.failed', id: 'A', operationId: 'stale',
        status: 'error', error: 'stale',
      },
      { type: 'detail.load.aborted', id: 'A', operationId: 'stale' },
    ] as const
    for (const action of staleDetailActions) expect(reduce(state, action)).toBe(loading)

    state = reduce(state, {
      type: 'turn.started',
      key: existing('A'),
      operationId: 'current-turn',
      optimisticMessages: createOptimisticMessages('Prompt', 'A', at),
    })
    const streaming = state
    expect(reduce(state, {
      type: 'turn.event', key: existing('A'), operationId: 'stale', event: completed('A'), at,
    })).toBe(streaming)
    expect(reduce(state, {
      type: 'turn.failed', key: existing('A'), operationId: 'stale',
      error: 'stale', cancelled: false, at,
    })).toBe(streaming)
    expect(reduce(state, {
      type: 'turn.aborted', key: existing('A'), operationId: 'stale', at,
    })).toBe(streaming)
  })

  it('preserves ready detail when catalog fails and catalog data when detail fails', () => {
    let state = initialConversationControllerState()
    state = reduce(state, { type: 'detail.load.started', id: 'A', operationId: 'load-A' })
    state = reduce(state, {
      type: 'detail.load.succeeded', id: 'A', operationId: 'load-A', detail: detail('A'),
    })
    state = reduce(state, { type: 'catalog.load.started', operationId: 'catalog', refreshing: false })
    state = reduce(state, {
      type: 'catalog.load.failed', operationId: 'catalog', error: 'Catalog unavailable.',
    })
    expect(state.catalog).toMatchObject({ status: 'error', error: 'Catalog unavailable.' })
    expect(state.conversationsById.A).toMatchObject({ detail: { status: 'ready' } })

    state = reduce(state, {
      type: 'catalog.conversation.upserted', conversation: summary('B'),
    })
    state = reduce(state, { type: 'detail.load.started', id: 'B', operationId: 'load-B' })
    state = reduce(state, {
      type: 'detail.load.failed', id: 'B', operationId: 'load-B',
      status: 'error', error: 'Detail unavailable.',
    })
    expect(state.catalog.conversations.map((item) => item.id)).toContain('B')
    expect(state.conversationsById.B.detail).toEqual({
      status: 'error', error: 'Detail unavailable.',
    })
  })

  it('maps only 404 detail failures to not-found', () => {
    expect(detailFailureStatus(404)).toBe('not-found')
    expect(detailFailureStatus(500)).toBe('error')
    expect(detailFailureStatus(undefined)).toBe('error')
  })

  it('does not loop a persistent detail failure without an explicit retry', () => {
    expect(shouldLoadConversationDetail(undefined)).toBe(true)
    expect(shouldLoadConversationDetail('idle')).toBe(true)
    expect(shouldLoadConversationDetail('error')).toBe(false)
    expect(shouldLoadConversationDetail('not-found')).toBe(false)
    expect(shouldLoadConversationDetail('error', true)).toBe(true)
  })

  it('applies slow move/delete results to A without changing B', () => {
    let state = initialConversationControllerState()
    state = reduce(state, {
      type: 'catalog.conversation.upserted', conversation: summary('A'),
    })
    state = reduce(state, {
      type: 'catalog.conversation.upserted', conversation: summary('B'),
    })
    state = reduce(state, { type: 'detail.load.started', id: 'B', operationId: 'load-B' })
    state = reduce(state, {
      type: 'detail.load.succeeded', id: 'B', operationId: 'load-B', detail: detail('B'),
    })
    const activeB = selectActiveConversation(state, existing('B'))

    state = reduce(state, {
      type: 'catalog.conversation.upserted', conversation: summary('A', 'project'),
    })
    expect(selectActiveConversation(state, existing('B'))).toEqual(activeB)
    expect(state.catalog.conversations.map((item) => item.id)).toEqual(['A', 'B'])
    expect(state.catalog.conversations.find((item) => item.id === 'A')?.project_id)
      .toBe('project')

    state = reduce(state, { type: 'catalog.conversation.removed', id: 'A' })
    expect(selectActiveConversation(state, existing('B'))).toEqual(activeB)
    expect(state.catalog.deletedConversationIds).toContain('A')
    expect(state.catalog.deletedConversationIds).not.toContain('B')
  })

  it('keeps catalog position on detail load and prepends on genuine turn activity', () => {
    let state = initialConversationControllerState()
    state = reduce(state, { type: 'catalog.load.started', operationId: 'catalog', refreshing: false })
    state = reduce(state, {
      type: 'catalog.load.succeeded',
      operationId: 'catalog',
      conversations: [summary('A'), summary('B')],
      projects: [],
    })
    state = reduce(state, { type: 'detail.load.started', id: 'B', operationId: 'load-B' })
    state = reduce(state, {
      type: 'detail.load.succeeded',
      id: 'B',
      operationId: 'load-B',
      detail: { ...detail('B'), title: 'Updated B', project_id: null },
    })

    expect(state.catalog.conversations.map((item) => item.id)).toEqual(['A', 'B'])
    expect(state.catalog.conversations.find((item) => item.id === 'B')).toMatchObject({
      title: 'Updated B',
      project_id: null,
    })

    state = reduce(state, {
      type: 'turn.started',
      key: existing('B'),
      operationId: 'turn-B',
      optimisticMessages: createOptimisticMessages('Prompt', 'B', at),
    })
    expect(state.catalog.conversations.map((item) => item.id)).toEqual(['A', 'B'])

    state = reduce(state, {
      type: 'turn.event', key: existing('B'), operationId: 'turn-B', event: started('B'), at,
    })
    expect(state.catalog.conversations.map((item) => item.id)).toEqual(['B', 'A'])

    state = reduce(state, {
      type: 'turn.event',
      key: existing('B'),
      operationId: 'turn-B',
      event: completed('B'),
      at: at + 1_000,
    })
    expect(state.catalog.conversations.map((item) => item.id)).toEqual(['B', 'A'])
  })

  it('inserts a deep-linked conversation by updated_at instead of index 0', () => {
    let state = initialConversationControllerState()
    state = reduce(state, { type: 'detail.load.started', id: 'B', operationId: 'load-empty' })
    state = reduce(state, {
      type: 'detail.load.succeeded',
      id: 'B',
      operationId: 'load-empty',
      detail: {
        ...detail('B'),
        updated_at: '2026-08-30T09:00:00.000Z',
      },
    })
    expect(state.catalog.conversations.map((item) => item.id)).toEqual(['B'])

    state = initialConversationControllerState()
    const newer = { ...summary('A'), updated_at: '2026-08-30T11:00:00.000Z' }
    const older = { ...summary('C'), updated_at: '2026-08-30T08:00:00.000Z' }
    state = reduce(state, { type: 'catalog.load.started', operationId: 'catalog', refreshing: false })
    state = reduce(state, {
      type: 'catalog.load.succeeded',
      operationId: 'catalog',
      conversations: [newer, older],
      projects: [],
    })
    state = reduce(state, { type: 'detail.load.started', id: 'B', operationId: 'load-B' })
    state = reduce(state, {
      type: 'detail.load.succeeded',
      id: 'B',
      operationId: 'load-B',
      detail: {
        ...detail('B'),
        updated_at: '2026-08-30T09:00:00.000Z',
      },
    })
    expect(state.catalog.conversations.map((item) => item.id)).toEqual(['A', 'B', 'C'])
  })

  it('rehydrates and advances an active agent run without moving the plan into messages', () => {
    let state = initialConversationControllerState()
    state = reduce(state, { type: 'detail.load.started', id: 'A', operationId: 'load' })
    state = reduce(state, {
      type: 'detail.load.succeeded',
      id: 'A',
      operationId: 'load',
      detail: {
        ...detail('A'),
        messages: [apiMessage('assistant', 'assistant', 'Waiting.', 'waiting')],
        active_run: {
          id: 'run-A',
          conversation_id: 'A',
          turn_id: 'turn-A',
          status: 'waiting',
          last_event_sequence: '10',
          plan: [{ id: 'inspect', title: 'Inspect the task', status: 'in_progress' }],
          pending_question: {
            question_id: 'continue',
            prompt: 'Continue?',
            options: [{ id: 'yes', label: 'Yes' }],
          },
          browser_projection: { id: 'browser', state: 'live', control: 'agent' },
        },
      },
    })

    let record = state.conversationsById.A
    expect(record).toMatchObject({
      activeRunId: 'run-A',
      activeTurnId: 'turn-A',
      lastSequence: '10',
      browser: { id: 'browser', status: 'agent-control' },
      plan: [{ id: 'inspect', status: 'in-progress' }],
    })
    expect(record.messages[0].blocks).toContainEqual(expect.objectContaining({
      type: 'question',
      request: expect.objectContaining({ id: 'continue', status: 'pending' }),
    }))
    expect(record.messages[0].blocks.some((block) => block.type === 'todo-list')).toBe(false)

    const event = (sequence: string, type: StreamEvent['type'], data: Record<string, unknown>) => ({
      version: 2 as const,
      sequence,
      run_id: 'run-A',
      turn_id: 'turn-A',
      type,
      data,
    }) as StreamEvent
    state = reduce(state, {
      type: 'run.event', key: existing('A'), at,
      event: event('11', 'plan.updated', {
        plan: [{ id: 'finish', title: 'Finish the task', status: 'pending' }],
      }),
    })
    state = reduce(state, {
      type: 'run.event', key: existing('A'), at,
      event: event('12', 'tool.started', {
        tool: { id: 'tool', name: 'read_file', label: 'Read file' },
      }),
    })
    record = state.conversationsById.A
    expect(record.plan).toEqual([{ id: 'finish', title: 'Finish the task', status: 'pending' }])
    expect(record.messages[0].blocks).toContainEqual(expect.objectContaining({
      type: 'activity',
      items: expect.arrayContaining([
        expect.objectContaining({ type: 'tool', action: 'read_file' }),
      ]),
    }))

    state = reduce(state, {
      type: 'run.event', key: existing('A'), at,
      event: event('13', 'turn.failed', {
        error: { code: 'cancelled', message: 'Turn cancelled.', retryable: false },
      }),
    })
    record = state.conversationsById.A
    expect(record.activeRunId).toBeUndefined()
    expect(record.browser).toMatchObject({ status: 'closed' })
    expect(record.messages[0].blocks).toContainEqual(expect.objectContaining({
      type: 'question',
      request: expect.objectContaining({ status: 'cancelled', result: 'Run cancelled.' }),
    }))
  })

  it('discovers active runs from the catalog before their conversations are opened', () => {
    let state = initialConversationControllerState()
    state = reduce(state, { type: 'catalog.load.started', operationId: 'catalog', refreshing: false })
    state = reduce(state, {
      type: 'catalog.load.succeeded',
      operationId: 'catalog',
      conversations: [summary('A'), summary('B')],
      projects: [],
      activeRuns: [{
        id: 'run-A',
        conversation_id: 'A',
        turn_id: 'turn-A',
        status: 'running',
        last_event_sequence: '10',
        plan: [{ id: 'inspect', title: 'Inspect', status: 'in_progress' }],
        pending_question: null,
        browser_projection: null,
      }],
    })

    expect(state.conversationsById.A).toMatchObject({
      id: 'A',
      title: 'Conversation A',
      activeRunId: 'run-A',
      activeRunStatus: 'running',
      lastSequence: '10',
      detail: { status: 'idle' },
      turn: { status: 'loading' },
    })
    expect(state.conversationsById.B).toBeUndefined()

    state = reduce(state, {
      type: 'run.event',
      key: existing('A'),
      at,
      event: { ...completed('A'), sequence: '11' },
    })
    expect(state.conversationsById.A.activeRunId).toBeUndefined()
  })

  it('preserves the locally applied cursor when the catalog projection is behind or ahead', () => {
    let state = initialConversationControllerState()
    state = reduce(state, { type: 'turn.started', key: existing('A'), operationId: 'turn',
      optimisticMessages: createOptimisticMessages('Prompt', 'turn', at) })
    state = reduce(state, { type: 'turn.event', key: existing('A'), operationId: 'turn', event: started('A'), at })
    state = reduce(state, { type: 'turn.detached', key: existing('A'), operationId: 'turn' })
    state = reduce(state, { type: 'run.event', key: existing('A'), event: { ...delta('A', 'Applied'), sequence: '10' }, at })
    state = reduce(state, { type: 'catalog.load.started', operationId: 'catalog', refreshing: false })
    state = reduce(state, {
      type: 'catalog.load.succeeded', operationId: 'catalog', conversations: [summary('A')], projects: [],
      activeRuns: [{ id: 'run-A', conversation_id: 'A', turn_id: 'turn-A', status: 'running',
        last_event_sequence: '12', plan: [], pending_question: null, browser_projection: null }],
    })
    expect(state.conversationsById.A.lastSequence).toBe('10')
  })

  it('invalidates ready detail when discovery switches to a different active run', () => {
    let state = initialConversationControllerState()
    state = reduce(state, { type: 'detail.load.started', id: 'A', operationId: 'detail' })
    state = reduce(state, { type: 'detail.load.succeeded', id: 'A', operationId: 'detail', detail: {
      ...detail('A'), active_run: { id: 'run-old', conversation_id: 'A', turn_id: 'turn-old', status: 'running',
        last_event_sequence: '3', plan: [], pending_question: null, browser_projection: null },
    } })
    state = reduce(state, { type: 'catalog.load.started', operationId: 'catalog', refreshing: false })
    state = reduce(state, {
      type: 'catalog.load.succeeded', operationId: 'catalog', conversations: [summary('A')], projects: [],
      activeRuns: [{ id: 'run-new', conversation_id: 'A', turn_id: 'turn-new', status: 'running',
        last_event_sequence: '4', plan: [], pending_question: null, browser_projection: null }],
    })
    expect(state.conversationsById.A).toMatchObject({ activeRunId: 'run-new', lastSequence: '4', detail: { status: 'idle' } })
  })

  it('does not let delayed catalog discovery replace a locally owned run', () => {
    let state = initialConversationControllerState()
    state = reduce(state, { type: 'turn.started', key: existing('A'), operationId: 'turn',
      optimisticMessages: createOptimisticMessages('Prompt', 'turn', at) })
    state = reduce(state, { type: 'turn.event', key: existing('A'), operationId: 'turn', event: started('A'), at })
    state = reduce(state, { type: 'catalog.load.started', operationId: 'catalog', refreshing: false })
    state = reduce(state, {
      type: 'catalog.load.succeeded', operationId: 'catalog', conversations: [summary('A')], projects: [],
      activeRuns: [{ id: 'run-delayed', conversation_id: 'A', turn_id: 'turn-delayed', status: 'running',
        last_event_sequence: '20', plan: [], pending_question: null, browser_projection: null }],
    })
    expect(state.conversationsById.A.activeRunId).toBe('run-A')
    expect(state.conversationsById.A.turn.operationId).toBe('turn')
  })

  it('ignores catalog discovery before a local turn has received its run identity', () => {
    let state = initialConversationControllerState()
    state = reduce(state, { type: 'turn.started', key: existing('A'), operationId: 'turn',
      optimisticMessages: createOptimisticMessages('Prompt', 'turn', at) })
    state = reduce(state, { type: 'catalog.load.started', operationId: 'catalog', refreshing: false })
    state = reduce(state, {
      type: 'catalog.load.succeeded', operationId: 'catalog', conversations: [summary('A')], projects: [],
      activeRuns: [{ id: 'run-delayed', conversation_id: 'A', turn_id: 'turn-delayed', status: 'running',
        last_event_sequence: '20', plan: [], pending_question: null, browser_projection: null }],
    })
    expect(state.conversationsById.A.activeRunId).toBeUndefined()
    expect(state.conversationsById.A.turn.operationId).toBe('turn')
  })

  it('detaches navigation from a cloud run and accepts later subscribed events', () => {
    let state = initialConversationControllerState()
    state = reduce(state, {
      type: 'turn.started', key: existing('A'), operationId: 'turn',
      optimisticMessages: createOptimisticMessages('Prompt', 'turn', at),
    })
    state = reduce(state, {
      type: 'turn.event', key: existing('A'), operationId: 'turn', event: started('A'), at,
    })
    state = reduce(state, {
      type: 'turn.detached', key: existing('A'), operationId: 'turn',
    })
    expect(state.conversationsById.A).toMatchObject({
      activeRunId: 'run-A',
      activeAssistantId: 'A-assistant',
      turn: { status: 'loading', operationId: undefined },
    })

    state = reduce(state, {
      type: 'run.event', key: existing('A'), event: delta('A', 'Continued'), at,
    })
    expect(state.conversationsById.A.messages.at(-1)?.blocks).toContainEqual(
      expect.objectContaining({ type: 'text', content: 'Continued' }),
    )
  })
})

describe('first response acceptance', () => {
  it('only navigates an initial handoff while the mounted new route is rendered', () => {
    expect(shouldNavigateInitialHandoff(undefined, true)).toBe(true)
    expect(shouldNavigateInitialHandoff('conversation-A', true)).toBe(false)
    expect(shouldNavigateInitialHandoff(undefined, false)).toBe(false)
  })

  it('accepts the durable conversation immediately and exactly once', () => {
    const accept = vi.fn()
    const gate = createNewConversationGate(accept)
    gate(started('A'))
    gate(started('A'))
    gate(delta('A', 'Answer'))
    gate(failed('A'))
    expect(accept).toHaveBeenCalledExactlyOnceWith('A')
  })

  it('does not accept progress without the durable conversation identity', () => {
    const accept = vi.fn()
    const gate = createNewConversationGate(accept)
    gate(delta('A', 'Partial'))
    gate(failed('A'))
    expect(accept).not.toHaveBeenCalled()
  })
})
