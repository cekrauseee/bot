import { describe, expect, it } from 'vitest'

import {
  conversationPath,
  conversationPathForRoute,
  deletedActiveConversationPath,
} from './conversation-path'
import type { ProjectSummary } from './model'

const project: ProjectSummary = {
  id: 'project-id',
  name: 'Résumé review',
  slug: 'resume-review',
  sort_order: null,
  order_updated_at: null,
  created_at: '2026-08-29T10:00:00.000Z',
  updated_at: '2026-08-29T10:00:00.000Z',
}

describe('conversation paths', () => {
  it('uses the project slug for grouped conversations', () => {
    expect(conversationPath({ id: 'conversation-id', project_id: project.id }, [project]))
      .toBe('/projects/resume-review/conversation-id')
  })

  it('keeps ungrouped and unresolved conversations under recents', () => {
    expect(conversationPath({ id: 'conversation-id', project_id: null }, [project]))
      .toBe('/conversations/conversation-id')
    expect(conversationPath({ id: 'conversation-id', project_id: 'missing' }, [project]))
      .toBe('/conversations/conversation-id')
  })

  it('builds route paths from rendered URL metadata', () => {
    expect(conversationPathForRoute('conversation-id', 'project / one'))
      .toBe('/projects/project%20%2F%20one/conversation-id')
    expect(conversationPathForRoute('conversation-id'))
      .toBe('/conversations/conversation-id')
  })

  it('recovers only when the conversation in the current URL was deleted', () => {
    expect(deletedActiveConversationPath('B', ['A'])).toBeUndefined()
    expect(deletedActiveConversationPath('A', ['A'])).toBe('/')
    expect(deletedActiveConversationPath(undefined, ['A'])).toBeUndefined()
  })
})
