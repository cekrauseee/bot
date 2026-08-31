import { describe, expect, it } from 'vitest'

import type { ConversationSummary } from '../model'
import { conversationControllerReducer as reduce, initialConversationControllerState } from './conversation-controller'
import { pinnedConversations } from './pinned-conversations'
import { reorderIds } from './sidebar-order'

const summary = (id: string, pinned_order: number | null = null, pin_updated_at: string | null = null): ConversationSummary => ({
  id, title: id, project_id: 'project', pinned_order, pin_updated_at,
  title_updated_at: null,
  created_at: '2026-08-31T10:00:00.000Z', updated_at: '2026-08-31T10:00:00.000Z',
})
const clock = (seconds: number) => new Date(Date.parse('2026-08-31T11:00:00Z') + seconds * 1000).toISOString()
const populated = () => {
  const state = initialConversationControllerState()
  return { ...state, catalog: { ...state.catalog, conversations: [summary('a'), summary('b'), summary('c')] } }
}

describe('pinned conversations', () => {
  it('sorts pinned chats independently of recency and keeps project ownership', () => {
    let state = populated()
    state = reduce(state, { type: 'catalog.pins.updated', conversations: [summary('c', 1, clock(1)), summary('a', 2, clock(1))] })
    expect(state.catalog.conversations.map((item) => item.id)).toEqual(['a', 'b', 'c'])
    expect(pinnedConversations(state.catalog.conversations).map((item) => item.id)).toEqual(['c', 'a'])
    expect(state.catalog.conversations[0]).toMatchObject({ project_id: 'project', updated_at: summary('a').updated_at })
    state = reduce(state, { type: 'catalog.pins.updated', conversations: [summary('a', null, clock(2))] })
    expect(pinnedConversations(state.catalog.conversations).map((item) => item.id)).toEqual(['c'])
  })

  it('does not undo a pin when a delayed catalog or detail returns', () => {
    let state = reduce(populated(), { type: 'catalog.load.started', operationId: 'catalog', refreshing: true })
    state = reduce(state, { type: 'detail.load.started', id: 'a', operationId: 'detail' })
    state = reduce(state, { type: 'catalog.pins.updated', conversations: [summary('a', 1, clock(2))] })
    state = reduce(state, { type: 'catalog.load.succeeded', operationId: 'catalog', conversations: [summary('a')], projects: [] })
    state = reduce(state, { type: 'detail.load.succeeded', id: 'a', operationId: 'detail', detail: { ...summary('a'), messages: [] } })
    expect(state.catalog.conversations.find((item) => item.id === 'a')).toMatchObject({ pinned_order: 1, pin_updated_at: clock(2) })
  })

  it('accepts newer pins from a refresh even when chat recency is unchanged or older', () => {
    let state = populated()
    state.catalog.conversations[0] = { ...summary('a'), updated_at: clock(10) }
    state = reduce(state, { type: 'catalog.load.started', operationId: 'load', refreshing: true })
    state = reduce(state, { type: 'catalog.load.succeeded', operationId: 'load', conversations: [summary('a', 2, clock(3))], projects: [] })
    expect(state.catalog.conversations[0]).toMatchObject({ pinned_order: 2, updated_at: clock(10) })
  })

  it('preserves newer chat activity and ignores stale mutation results', () => {
    let state = populated()
    state.catalog.conversations[0] = { ...summary('a', null, clock(4)), title: 'New title', updated_at: clock(10) }
    state = reduce(state, { type: 'catalog.pins.updated', conversations: [summary('a', 2, clock(2))] })
    expect(state.catalog.conversations[0]).toMatchObject({ title: 'New title', pinned_order: null, updated_at: clock(10), pin_updated_at: clock(4) })
  })

  it('does not resurrect a deleted pinned conversation on mutation completion', () => {
    let state = reduce(populated(), { type: 'catalog.conversation.removed', id: 'a' })
    state = reduce(state, { type: 'catalog.pins.updated', conversations: [summary('a', 1, clock(2))] })
    expect(state.catalog.conversations.some((item) => item.id === 'a')).toBe(false)
  })

  it('retains pins when a delayed stream starts', () => {
    let state = reduce(populated(), { type: 'turn.started', key: { kind: 'existing', id: 'a' }, operationId: 'turn', input: { message: 'Hello', model: 'gpt-5.6-sol', reasoning_effort: 'medium', speed: 'standard' }, optimisticMessages: [] })
    state = reduce(state, { type: 'catalog.pins.updated', conversations: [summary('a', 1, clock(2))] })
    const message = { id: 'user', role: 'user' as const, content: 'Hello', created_at: clock(1), updated_at: clock(1) }
    state = reduce(state, { type: 'turn.event', key: { kind: 'existing', id: 'a' }, operationId: 'turn', at: Date.parse(clock(3)), event: {
      type: 'turn.started', version: 1, sequence: 0, turn_id: 'turn', data: { conversation: summary('a'), user_message: message, assistant_message: { ...message, id: 'assistant', role: 'assistant' } },
    } })
    expect(state.catalog.conversations[0]).toMatchObject({ pinned_order: 1, pin_updated_at: clock(2) })
  })

  it('reorders only known pinned IDs and supports both edges', () => {
    const ids = ['a', 'b', 'c']
    expect(reorderIds(ids, 'a', 'c', 'after')).toEqual(['b', 'c', 'a'])
    expect(reorderIds(ids, 'c', 'a', 'before')).toEqual(['c', 'a', 'b'])
    expect(reorderIds(ids, 'not-pinned', 'a', 'before')).toBe(ids)
    expect(reorderIds(ids, 'a', 'not-pinned', 'after')).toBe(ids)
    expect(reorderIds(ids, 'a', 'a', 'after')).toBe(ids)
    expect(ids).toEqual(['a', 'b', 'c'])
  })
})
