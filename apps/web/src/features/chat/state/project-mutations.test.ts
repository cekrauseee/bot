import { describe, expect, it } from 'vitest'

import type { ConversationSummary, ProjectSummary } from '../model'
import { conversationPath } from '../conversation-path'
import {
  conversationControllerReducer as reduce,
  initialConversationControllerState,
} from './conversation-controller'

const project: ProjectSummary = {
  id: 'project-a', name: 'Website', slug: 'website',
  sort_order: null, order_updated_at: null,
  created_at: '2026-08-30T10:00:00Z', updated_at: '2026-08-30T10:00:00Z',
}
const conversation: ConversationSummary = {
  id: 'conversation-a', title: 'Planning', project_id: project.id,
  title_updated_at: null,
  pinned_order: null, pin_updated_at: null,
  created_at: project.created_at, updated_at: project.updated_at,
}
const populated = () => {
  const state = initialConversationControllerState()
  return { ...state, catalog: { ...state.catalog, projects: [project], conversations: [conversation] } }
}

describe('project mutations', () => {
  it('persists explicit order through a delayed catalog and preserves a newer rename', () => {
    const other = { ...project, id: 'project-b', name: 'Other', slug: 'other', sort_order: 1 }
    const initial = populated()
    initial.catalog.projects = [{ ...project, sort_order: 0 }, other]
    let state = reduce(initial, { type: 'catalog.load.started', operationId: 'old-order', refreshing: true })
    const reordered = [
      { ...other, sort_order: 0, order_updated_at: '2026-08-31T11:00:00Z' },
      { ...project, sort_order: 1, order_updated_at: '2026-08-31T11:00:00Z' },
    ]
    state = reduce(state, { type: 'catalog.projects.reordered', projects: reordered })
    state = reduce(state, { type: 'catalog.project.renamed', project: {
      ...project, name: 'Renamed', slug: 'renamed', updated_at: '2026-08-31T12:00:00Z',
    } })
    state = reduce(state, { type: 'catalog.load.succeeded', operationId: 'old-order', projects: initial.catalog.projects, conversations: [] })
    expect(state.catalog.projects.map((item) => item.id)).toEqual(['project-b', 'project-a'])
    expect(state.catalog.projects[1]).toMatchObject({ name: 'Renamed', sort_order: 1 })
    expect(state.catalog.conversations).toEqual(initial.catalog.conversations)
  })

  it('keeps new projects and tombstones when an earlier reorder completes', () => {
    const original = populated()
    original.catalog.projects.push({ ...project, id: 'removed', sort_order: 1 })
    let state = reduce(original, { type: 'catalog.project.removed', id: 'removed' })
    state = reduce(state, { type: 'catalog.project.added', project: { ...project, id: 'new', created_at: '2026-08-31T10:00:00Z' } })
    state = reduce(state, { type: 'catalog.projects.reordered', projects: original.catalog.projects.map((item, index) => ({
      ...item, sort_order: index, order_updated_at: '2026-08-31T11:00:00Z',
    })) })
    expect(state.catalog.projects.map((item) => item.id)).toEqual(['new', 'project-a'])
  })

  it('ignores an outdated reorder result without overwriting project content', () => {
    const initial = populated()
    initial.catalog.projects[0] = { ...project, name: 'New name', sort_order: 2, order_updated_at: '2026-08-31T12:00:00Z' }
    const state = reduce(initial, { type: 'catalog.projects.reordered', projects: [{ ...project, sort_order: 0, order_updated_at: '2026-08-31T11:00:00Z' }] })
    expect(state.catalog.projects[0]).toEqual(initial.catalog.projects[0])
  })

  it('loads a newer order independently of a more recent project rename', () => {
    let state = populated()
    state.catalog.projects[0] = { ...project, name: 'Renamed', updated_at: '2026-08-31T13:00:00Z', sort_order: 0 }
    state = reduce(state, { type: 'catalog.load.started', operationId: 'order', refreshing: true })
    state = reduce(state, { type: 'catalog.load.succeeded', operationId: 'order', conversations: [], projects: [{ ...project, sort_order: 2, order_updated_at: '2026-08-31T12:00:00Z' }] })
    expect(state.catalog.projects[0]).toMatchObject({ name: 'Renamed', sort_order: 2 })
  })

  it('updates the name and route slug without moving the project or touching conversation state', () => {
    const original = populated()
    original.catalog.projects.unshift({ ...project, id: 'other', slug: 'other', created_at: '2026-08-30T11:00:00Z' })
    const next = reduce(original, {
      type: 'catalog.project.renamed',
      project: { ...project, name: 'New website', slug: 'new-website', updated_at: '2026-08-31T10:00:00Z' },
    })
    expect(next.catalog.projects.map((item) => item.id)).toEqual(['other', project.id])
    expect(conversationPath(conversation, next.catalog.projects)).toContain('/new-website/')
    expect(next.conversationsById).toBe(original.conversationsById)
    expect(next.catalog.conversations).toBe(original.catalog.conversations)
  })

  it('keeps conversations and rejects deleted projects from a delayed catalog response', () => {
    let state = reduce(populated(), { type: 'catalog.load.started', operationId: 'old', refreshing: true })
    state = reduce(state, { type: 'catalog.project.removed', id: project.id })
    state = reduce(state, {
      type: 'catalog.load.succeeded', operationId: 'old', projects: [project],
      conversations: [{ ...conversation, updated_at: '2026-08-31T11:00:00Z' }],
    })
    expect(state.catalog.projects).toEqual([])
    expect(state.catalog.conversations).toEqual([{ ...conversation, project_id: null, updated_at: '2026-08-31T11:00:00Z' }])
    expect(conversationPath(state.catalog.conversations[0]!, [])).toBe('/conversations/conversation-a')
  })

  it('does not let a delayed detail response restore deleted project membership', () => {
    let state = reduce(populated(), { type: 'detail.load.started', id: conversation.id, operationId: 'detail' })
    state = reduce(state, { type: 'catalog.project.removed', id: project.id })
    state = reduce(state, {
      type: 'detail.load.succeeded', id: conversation.id, operationId: 'detail',
      detail: { ...conversation, messages: [] },
    })
    expect(state.catalog.conversations[0]?.project_id).toBeNull()
    expect(state.conversationsById[conversation.id]?.detail.status).toBe('ready')
  })

  it('preserves a newer rename when an older catalog response arrives', () => {
    let state = reduce(populated(), { type: 'catalog.load.started', operationId: 'old', refreshing: true })
    const renamed = { ...project, name: 'New website', slug: 'new-website', updated_at: '2026-08-31T10:00:00Z' }
    state = reduce(state, { type: 'catalog.project.renamed', project: renamed })
    state = reduce(state, { type: 'catalog.load.succeeded', operationId: 'old', projects: [project], conversations: [conversation] })
    expect(state.catalog.projects).toEqual([renamed])
  })
})
