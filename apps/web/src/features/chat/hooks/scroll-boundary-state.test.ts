import { describe, expect, it } from 'vitest'
import { scrollBoundaryState } from './scroll-boundary-state'

describe('content touching scroll boundaries', () => {
  it('ignores scrolled padding while the first block is still below the header', () => {
    expect(scrollBoundaryState(56, 600, { top: 70, bottom: 120, height: 50 }).scrolled).toBe(false)
  })

  it.each([56, 55, -40])('shows the header divider when the first block reaches or crosses it: %i', (top) => {
    expect(scrollBoundaryState(56, 600, { top, bottom: top + 50, height: 50 }).scrolled).toBe(true)
  })

  it.each([[620, true], [600, false], [590, false]] as const)(
    'uses the last block edge, not trailing padding: %i', (bottom, visible) => {
      expect(scrollBoundaryState(56, 600, undefined,
        { top: bottom - 24, bottom, height: 24 }).overflowingBelow).toBe(visible)
    },
  )

  it('keeps dividers hidden when content is absent or hidden', () => {
    expect(scrollBoundaryState(56, 600)).toEqual({ scrolled: false, overflowingBelow: false })
    const hidden = { top: 0, bottom: 0, height: 0 }
    expect(scrollBoundaryState(56, 600, hidden, hidden)).toEqual({ scrolled: false, overflowingBelow: false })
  })
})
