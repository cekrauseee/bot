import { describe, expect, it } from 'vitest'

import { seedConversations, seedMessageCount } from '../src/db/seed-data.js'
import { seedUuid } from '../src/db/seeder.js'

describe('application seed data', () => {
  it('contains complete alternating conversations with broad Markdown coverage', () => {
    expect(seedConversations).toHaveLength(5)
    expect(seedMessageCount).toBe(18)

    for (const conversation of seedConversations) {
      expect(conversation.messages.length % 2).toBe(0)
      conversation.messages.forEach((message, index) => {
        expect(message.role).toBe(index % 2 === 0 ? 'user' : 'assistant')
        expect(message.content.trim()).not.toBe('')
      })
    }

    const markdown = seedConversations[0].messages.map(({ content }) => content).join('\n')
    for (const syntax of ['# ', '## ', '- ', '1. ', '- [x]', '| --- |', '> ', '`inline code`',
      '```typescript', '```bash', '```json', '```diff', '[CommonMark specification]']) {
      expect(markdown).toContain(syntax)
    }
  })

  it('derives stable local UUIDs without sharing IDs between users', () => {
    const first = seedUuid('mybot-seed-v1', 'user-a', 'conversation', 'markdown')
    expect(first).toBe(seedUuid('mybot-seed-v1', 'user-a', 'conversation', 'markdown'))
    expect(first).not.toBe(seedUuid('mybot-seed-v1', 'user-b', 'conversation', 'markdown'))
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})
