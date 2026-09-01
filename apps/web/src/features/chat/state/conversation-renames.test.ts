import { describe, expect, it } from 'vitest'

import type { ConversationSummary } from '../model'
import { conversationControllerReducer as reduce, initialConversationControllerState } from './conversation-controller'

const original: ConversationSummary = {
  id: 'conversation', title: 'Original title', title_updated_at: null,
  project_id: 'project', pinned_order: 2, pin_updated_at: '2026-08-31T09:00:00Z',
  created_at: '2026-08-30T10:00:00Z', updated_at: '2026-08-31T10:00:00Z',
}
const renamed = { ...original, title: 'Renamed title', title_updated_at: '2026-08-31T11:00:00Z' }
const populated = () => {
  const state = initialConversationControllerState()
  return { ...state, catalog: { ...state.catalog, conversations: [{ ...original, id: 'other' }, original] } }
}

describe('conversation renames', () => {
  it('renames an open conversation without changing recency, pinning, membership or messages', () => {
    let state = reduce(populated(), { type: 'detail.load.started', id: original.id, operationId: 'detail' })
    state = reduce(state, { type: 'detail.load.succeeded', id: original.id, operationId: 'detail', detail: { ...original, messages: [] } })
    const messages = state.conversationsById[original.id].messages
    state = reduce(state, { type: 'catalog.conversation.renamed', conversation: renamed })
    expect(state.catalog.conversations.map((item) => item.id)).toEqual(['other', original.id])
    expect(state.catalog.conversations[1]).toEqual(renamed)
    expect(state.conversationsById[original.id].title).toBe('Renamed title')
    expect(state.conversationsById[original.id].messages).toBe(messages)
  })

  it('preserves the rename when earlier catalog, detail and move results arrive', () => {
    let state = reduce(populated(), { type: 'catalog.load.started', operationId: 'catalog', refreshing: true })
    state = reduce(state, { type: 'detail.load.started', id: original.id, operationId: 'detail' })
    state = reduce(state, { type: 'catalog.conversation.renamed', conversation: renamed })
    state = reduce(state, { type: 'catalog.load.succeeded', operationId: 'catalog', conversations: [original], projects: [] })
    state = reduce(state, { type: 'detail.load.succeeded', id: original.id, operationId: 'detail', detail: { ...original, messages: [] } })
    state = reduce(state, { type: 'catalog.conversation.upserted', conversation: { ...original, project_id: null } })
    expect(state.catalog.conversations.find((item) => item.id === original.id)).toMatchObject({ title: renamed.title, project_id: null })
    expect(state.conversationsById[original.id].title).toBe(renamed.title)
  })

  it('ignores an outdated rename and never restores a deleted conversation', () => {
    let state = reduce(populated(), { type: 'catalog.conversation.renamed', conversation: renamed })
    state = reduce(state, { type: 'catalog.conversation.renamed', conversation: { ...original, title_updated_at: '2026-08-31T10:30:00Z' } })
    expect(state.catalog.conversations[1].title).toBe(renamed.title)
    state = reduce(state, { type: 'catalog.conversation.removed', id: original.id })
    state = reduce(state, { type: 'catalog.conversation.renamed', conversation: renamed })
    expect(state.catalog.conversations.map((item) => item.id)).toEqual(['other'])
  })

  it('keeps retry feedback and cached conversations while reloading a failed catalog', () => {
    let state = reduce(populated(), { type: 'catalog.load.started', operationId: 'first', refreshing: true })
    state = reduce(state, { type: 'catalog.load.failed', operationId: 'first', error: 'Request failed' })
    state = reduce(state, { type: 'catalog.load.started', operationId: 'retry', refreshing: true })
    expect(state.catalog).toMatchObject({ status: 'refreshing', error: 'Request failed', conversations: populated().catalog.conversations })
    state = reduce(state, { type: 'catalog.load.succeeded', operationId: 'retry', conversations: [original], projects: [] })
    expect(state.catalog).toMatchObject({ status: 'ready', error: '' })
  })
})
