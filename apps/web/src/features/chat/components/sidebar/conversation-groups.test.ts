import { describe, expect, it } from 'vitest'

import { groupConversations } from './conversation-groups'

const summary = (id: string, updatedAt: string) => ({
  id,
  title: id,
  created_at: updatedAt,
  updated_at: updatedAt,
})

describe('conversation date groups', () => {
  it('uses local calendar boundaries and preserves source order', () => {
    const groups = groupConversations([
      summary('today', '2026-08-28T00:05:00'),
      summary('yesterday', '2026-08-27T23:55:00'),
      summary('week-a', '2026-08-24T12:00:00'),
      summary('week-b', '2026-08-23T12:00:00'),
      summary('month', '2026-08-10T12:00:00'),
      summary('older', '2026-06-01T12:00:00'),
    ], new Date('2026-08-28T00:10:00'), 'en-GB')

    expect(groups.map((group) => group.label)).toEqual([
      'Today',
      'Yesterday',
      'Previous 7 days',
      'Previous 30 days',
      'June 2026',
    ])
    expect(groups[2].conversations.map((conversation) => conversation.id))
      .toEqual(['week-a', 'week-b'])
  })
})
