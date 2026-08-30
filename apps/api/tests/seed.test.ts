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
