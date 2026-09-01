import { describe, expect, it } from 'vitest'
import { coordinatedMessageTransition, createConversationEntry } from './conversation-entry'

describe('composer and history entry coordination', () => {
  it('scopes the shared clock to the conversation that started docking', () => {
    let time = 100
    const entry = createConversationEntry(() => time)
    expect(entry.elapsed('A')).toBeUndefined()
    entry.select('A')
    entry.begin()
    time = 180
    expect(entry.elapsed('A')).toBe(80)
    entry.select('B')
    expect(entry.elapsed('B')).toBeUndefined()
    entry.begin()
    expect(entry.elapsed('B')).toBe(0)
    expect(entry.elapsed('A')).toBeUndefined()
  })

  it.each([0, 40, 120, 230])('keeps all four history rows on the composer deadline after %i ms', (elapsed) => {
    for (let index = 0; index < 4; index += 1) {
      const transition = coordinatedMessageTransition(index, 4, elapsed, false)
      expect(transition.duration + transition.delay).toBeCloseTo((240 - elapsed) / 1000)
      expect(transition.duration).toBeGreaterThan(0)
    }
  })

  it('reveals late history without replaying an expired composer animation', () => {
    const transition = coordinatedMessageTransition(3, 4, 1500, false)
    expect(transition.delay).toBe(0.09)
    expect(transition.duration + transition.delay).toBeCloseTo(0.24)
  })

  it('removes staggering under reduced motion', () => {
    for (let index = 0; index < 4; index += 1) {
      const transition = coordinatedMessageTransition(index, 4, 100, true)
      expect(transition.delay).toBe(0)
      expect(transition.duration).toBe(0.12)
    }
  })
})
