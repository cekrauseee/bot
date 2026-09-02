import { describe, expect, it } from 'vitest'

import { seedConversations, seedMessageCount } from '../src/db/seed-data.js'
import { seedUuid } from '../src/db/seeder.js'

describe('application seed data', () => {
  it('contains complete alternating conversations with broad Markdown coverage', () => {
    expect(seedConversations).toHaveLength(32)
    expect(seedMessageCount).toBe(336)

    const conversationKeys = new Set<string>()
    const messageKeys = new Set<string>()

    for (const conversation of seedConversations) {
      expect(conversationKeys.has(conversation.key)).toBe(false)
      conversationKeys.add(conversation.key)
      expect(conversation.messages.length).toBeGreaterThanOrEqual(6)
      expect(conversation.messages.length % 2).toBe(0)
      conversation.messages.forEach((message, index) => {
        expect(message.role).toBe(index % 2 === 0 ? 'user' : 'assistant')
        expect(message.content.trim()).not.toBe('')
        expect(messageKeys.has(message.key)).toBe(false)
        messageKeys.add(message.key)
        if (index > 0) {
          expect(message.minuteOffset).toBeGreaterThan(
            conversation.messages[index - 1].minuteOffset,
          )
        }
        if (message.role === 'assistant') {
          expect(message.durationSeconds).toBeGreaterThan(0)
          expect(message.reasoning?.length).toBeGreaterThan(500)
          expect(message.activities?.length).toBeGreaterThanOrEqual(6)
          for (const activity of message.activities ?? []) {
            if (
              typeof activity.id === 'string' &&
              activity.id.endsWith('-state')
            ) {
              expect(activity.meta).toBeUndefined()
            }
          }
        }
      })
    }

    const assistantMessages = seedConversations.flatMap(({ messages }) =>
      messages.filter(({ role }) => role === 'assistant'),
    )
    const processItemCount = assistantMessages.reduce(
      (total, message) => total + (message.activities?.length ?? 0),
      0,
    )
    expect(assistantMessages).toHaveLength(168)
    expect(processItemCount).toBeGreaterThan(1_200)

    const markdown = seedConversations
      .flatMap(({ messages }) => messages.map(({ content }) => content))
      .join('\n')
    for (const syntax of [
      '# ',
      '## ',
      '- ',
      '1. ',
      '- [x]',
      '| --- |',
      '> ',
      '`inline code`',
      '```typescript',
      '```bash',
      '```json',
      '```diff',
      '[CommonMark specification]',
      '$$',
      '$r = 3$',
    ]) {
      expect(markdown).toContain(syntax)
    }

    const activityTypes = new Set(
      seedConversations.flatMap(({ messages }) =>
        messages.flatMap((message) =>
          (message.activities ?? []).map((activity) => activity.type),
        ),
      ),
    )
    expect(activityTypes).toEqual(
      new Set(['search', 'step', 'text', 'tool', 'trace']),
    )

    const activities = assistantMessages.flatMap(
      (message) => message.activities ?? [],
    )
    const toolActions = new Set(
      activities.flatMap((activity) =>
        activity.type === 'tool' && typeof activity.action === 'string'
          ? [activity.action]
          : [],
      ),
    )
    for (const action of [
      'ask_user',
      'browser_click',
      'browser_close',
      'browser_open',
      'browser_snapshot',
      'filesystem_list',
      'filesystem_read',
      'filesystem_write',
      'shell_exec',
    ]) {
      expect(toolActions.has(action)).toBe(true)
    }

    expect(activities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'trace', kind: 'approval' }),
        expect.objectContaining({ type: 'trace', kind: 'child' }),
        expect.objectContaining({ type: 'tool', status: 'failed' }),
      ]),
    )

    const commandActivities = activities.filter(
      (activity) =>
        activity.type === 'tool' && activity.action === 'shell_exec',
    )
    expect(commandActivities.length).toBeGreaterThan(50)
    expect(
      commandActivities.every(
        (activity) =>
          typeof activity.target === 'string' && activity.target.length > 0,
      ),
    ).toBe(true)

    const family = (activity: Record<string, unknown>) => {
      if (activity.type === 'search') return 'web-search'
      if (activity.type !== 'tool' || typeof activity.action !== 'string')
        return undefined
      if (activity.action.startsWith('browser_')) return 'browser'
      if (activity.action === 'filesystem_list') return 'files-inspected'
      if (activity.action === 'filesystem_read') return 'files-read'
      if (activity.action === 'filesystem_write') return 'files-updated'
      if (activity.action === 'shell_exec') return 'commands'
      return undefined
    }
    const groupedFamilies = new Set<string>()
    for (const message of assistantMessages) {
      const messageActivities = message.activities ?? []
      for (let index = 1; index < messageActivities.length; index += 1) {
        const current = family(messageActivities[index])
        if (current && current === family(messageActivities[index - 1])) {
          groupedFamilies.add(current)
        }
      }
    }
    expect(groupedFamilies).toEqual(
      new Set([
        'browser',
        'commands',
        'files-inspected',
        'files-read',
        'files-updated',
        'web-search',
      ]),
    )
  })

  it('derives stable local UUIDs without sharing IDs between users', () => {
    const first = seedUuid(
      'mybot-seed-v1',
      'user-a',
      'conversation',
      'markdown',
    )
    expect(first).toBe(
      seedUuid('mybot-seed-v1', 'user-a', 'conversation', 'markdown'),
    )
    expect(first).not.toBe(
      seedUuid('mybot-seed-v1', 'user-b', 'conversation', 'markdown'),
    )
    expect(first).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
  })
})
