import { describe, expect, it, vi } from 'vitest'
import { visibleHistoryIndices } from './visible-history'
import { coordinatedMessageTransition } from './conversation-entry'

describe('visible history entrance', () => {
  it('includes more than four short rows and stops reading above the viewport', () => {
    const bounds = vi.fn((index: number) => {
      const top = 100 + (index - 9992) * 32
      return { top, bottom: top + 24, height: 24 }
    })
    expect(visibleHistoryIndices(10000, 100, 356, bounds)).toEqual([9992, 9993, 9994, 9995, 9996, 9997, 9998, 9999])
    expect(bounds).toHaveBeenCalledTimes(9)
  })

  it('includes partially visible rows at both edges', () => {
    expect(visibleHistoryIndices(3, 10, 65, (index) => ({ top: index * 32, bottom: index * 32 + 24, height: 24 })))
      .toEqual([0, 1, 2])
  })

  it.each([8, 16])('bounds stagger without shortening visibility for %i visible rows', (count) => {
    for (let index = 0; index < count; index += 1) {
      const transition = coordinatedMessageTransition(index, count, 0, false)
      expect(transition.delay).toBeLessThanOrEqual(0.09)
      expect(transition.duration).toBeGreaterThanOrEqual(0.15)
      expect(transition.delay + transition.duration).toBeCloseTo(0.24)
    }
  })
})
