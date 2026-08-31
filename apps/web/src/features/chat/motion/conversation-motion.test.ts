import { describe, expect, it } from 'vitest'

import {
  CONVERSATION_MOTION,
  MESSAGE_POP_UP,
  MESSAGE_POP_UP_FROM,
  MESSAGE_POP_UP_TO,
  conversationPaneKey,
  conversationPaneKind,
  conversationTitleVisualKey,
  conversationRevealTransition,
  historyCascadeStartIndex,
  resolveConversationTitle,
} from './conversation-motion'

describe('conversation motion decisions', () => {
  it.each<[number, number]>([
    [0, 0],
    [1, 0],
    [4, 0],
    [5, 1],
    [100, 96],
  ])('starts a %i-message history cascade at %i', (count: number, start: number) => {
    expect(historyCascadeStartIndex(count)).toBe(start)
  })

  it('starts all four history rows within 120ms', () => {
    const delays = [0, 1, 2, 3].map((index) =>
      conversationRevealTransition(index, 4, false).delay)
    delays.forEach((delay, index) => expect(delay).toBeCloseTo(index * 0.04))
    expect(delays.at(-1)).toBeLessThanOrEqual(0.12)
  })

  it.each([1, 2, 4, 10, 100])('finishes a %i-unit title or history at the same deadline', (count) => {
    for (let index = 0; index < count; index += 1) {
      const transition = conversationRevealTransition(index, count, false)
      expect(transition.delay + transition.duration).toBeCloseTo(0.45)
      expect(transition.delay).toBeLessThanOrEqual(0.12)
      expect(transition.duration).toBeGreaterThan(0)
    }
  })

  it('removes stagger and shares a shorter deadline under reduced motion', () => {
    for (const count of [1, 4, 100]) {
      const transition = conversationRevealTransition(count - 1, count, true)
      expect(transition.delay).toBe(0)
      expect(transition.duration).toBe(0.12)
    }
  })

  it('preserves the spring for newly sent messages', () => {
    expect(MESSAGE_POP_UP).toEqual({
      type: 'spring',
      stiffness: 320,
      damping: 32,
      mass: 0.7,
    })
    expect(CONVERSATION_MOTION.message.pop).toBe(MESSAGE_POP_UP)
  })

  it('pops history rows with a vertical lift and no scale', () => {
    expect(MESSAGE_POP_UP_FROM).toEqual({
      opacity: 0,
      transform: 'translateY(12px)',
    })
    expect(MESSAGE_POP_UP_TO).toEqual({
      opacity: 1,
      transform: 'translateY(0px)',
    })
  })

  it('fades the pane without a competing translate', () => {
    expect(CONVERSATION_MOTION.pane).toEqual({
      enterDuration: 0.18,
      exitDuration: 0.12,
    })
  })

  it('keeps cached content in the ready pane during refresh failures', () => {
    expect(conversationPaneKind({ status: 'error', messageCount: 2 })).toBe('ready')
    expect(conversationPaneKey('existing:a', 'ready')).toBe('existing:a:ready')
  })

  it('distinguishes loading, not-found, and empty ready details', () => {
    expect(conversationPaneKind({ status: 'loading', messageCount: 0 })).toBe('loading')
    expect(conversationPaneKind({ status: 'not-found', messageCount: 0 })).toBe('not-found')
    expect(conversationPaneKind({ status: 'ready', messageCount: 0 })).toBe('ready')
  })

  it('uses a catalog summary before detail and only skeletonizes unknown pending titles', () => {
    expect(resolveConversationTitle({
      detailTitle: 'New conversation',
      summaryTitle: 'Catalog title',
      status: 'loading',
    })).toEqual({ title: 'Catalog title', loading: false })
    expect(resolveConversationTitle({
      detailTitle: 'New conversation',
      status: 'loading',
    })).toEqual({ title: '', loading: true })
  })

  it('keys title layers on visible copy so catalog titles can swap', () => {
    expect(conversationTitleVisualKey('existing:a', 'Catalog', 'Work', false))
      .toBe('existing:a:Catalog:Work:false')
    expect(conversationTitleVisualKey('existing:a', 'Catalog', 'Work', false))
      .not.toBe(conversationTitleVisualKey('existing:a', 'Generated', 'Work', false))
    expect(conversationTitleVisualKey('existing:a', 'Same', undefined, false))
      .not.toBe(conversationTitleVisualKey('existing:b', 'Same', undefined, false))
  })

  it('preserves the title reveal blur and offset', () => {
    expect(CONVERSATION_MOTION.title).toEqual({
      exitDuration: 0.12,
      blur: 6,
      yOffset: '18%',
    })
  })
})
