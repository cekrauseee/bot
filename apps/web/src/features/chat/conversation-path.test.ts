import { describe, expect, it } from 'vitest'

import { conversationPath } from './conversation-path'
import type { ProjectSummary } from './model'

const project: ProjectSummary = {
  id: 'project-id',
  name: 'Résumé review',
  slug: 'resume-review',
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
})
