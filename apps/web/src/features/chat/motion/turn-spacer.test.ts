import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTurnSpacer } from './turn-spacer'

function fixture() {
  const layout = { viewportHeight: 600, paddingTop: 24, prefix: 1000, previousHeight: 80, gap: 28, userHeight: 48, answerHeight: 84 }
  const spacer = { style: { height: '' } }
  const space = () => parseFloat(spacer.style.height) || 0
  const viewport = {
    offsetTop: 100, offsetParent: null, clientTop: 0, scrollTop: 0,
    get clientHeight() { return layout.viewportHeight },
    get scrollHeight() { return Math.max(layout.viewportHeight, layout.paddingTop + layout.prefix + layout.userHeight + layout.gap + layout.answerHeight + space() + 40) },
  }
  const content = {
    offsetTop: 0, offsetParent: viewport, clientTop: 0,
    querySelectorAll: () => rows,
    contains: (element: unknown) => rows.includes(element as typeof user),
  }
  const previous = {
    dataset: { messageKey: 'previous-answer' }, offsetParent: content, clientTop: 0,
    get offsetTop() { return layout.paddingTop + layout.prefix - layout.previousHeight - layout.gap },
    get offsetHeight() { return layout.previousHeight },
  }
  const user = {
    dataset: { messageKey: 'user-1' }, offsetParent: content, clientTop: 0,
    get offsetTop() { return layout.paddingTop + layout.prefix },
    get offsetHeight() { return layout.userHeight },
  }
  const answer = {
    dataset: { messageKey: 'answer-1' }, offsetParent: content, clientTop: 0,
    get offsetTop() { return layout.paddingTop + layout.prefix + layout.userHeight + layout.gap },
    get offsetHeight() { return layout.answerHeight },
  }
  const rows = [previous, user, answer]
  vi.stubGlobal('getComputedStyle', () => ({ paddingTop: `${layout.paddingTop}px`, paddingBottom: '40px' }))
  const spacerController = createTurnSpacer(viewport as unknown as HTMLElement, content as unknown as HTMLElement, spacer as unknown as HTMLElement)
  return { layout, viewport, spacerController, space, user, rows }
}

afterEach(() => vi.unstubAllGlobals())

describe('temporary turn spacer', () => {
  it('reserves exactly enough room to position the sent message at the top', () => {
    const f = fixture()
    const target = f.spacerController.start('user-1')
    expect(target).toBe(1000)
    expect(f.space()).toBe(376)
    expect(f.viewport.scrollHeight - f.viewport.clientHeight).toBe(target)
  })

  it('moves past a previous surface that would overlap the desktop top inset', () => {
    const f = fixture()
    f.layout.paddingTop = 32
    expect(f.spacerController.start('user-1')).toBe(1006)
    expect(f.space()).toBe(374)
    expect(f.viewport.scrollHeight - f.viewport.clientHeight).toBe(1006)
  })

  it('lets the response consume space without changing scroll height or scroll position', () => {
    const f = fixture()
    f.viewport.scrollTop = f.spacerController.start('user-1')!
    const total = f.viewport.scrollHeight
    f.layout.answerHeight += 100
    f.spacerController.resize()
    expect(f.space()).toBe(276)
    expect(f.viewport.scrollHeight).toBe(total)
    expect(f.viewport.scrollTop).toBe(1000)
  })

  it('does not resurrect space after the response fills it, even if content later collapses', () => {
    const f = fixture()
    f.spacerController.start('user-1')
    f.layout.answerHeight = 900
    f.spacerController.resize()
    expect(f.space()).toBe(0)
    f.layout.answerHeight = 50
    f.spacerController.resize()
    expect(f.space()).toBe(0)
    expect(f.spacerController.start('user-1')).toBeNull()
  })

  it('keeps a short response spacer until the reader scrolls above its height', () => {
    const f = fixture()
    f.viewport.scrollTop = f.spacerController.start('user-1')!
    f.spacerController.onScroll(false)
    f.viewport.scrollTop = 800
    f.spacerController.onScroll(true)
    expect(f.space()).toBe(376)
    f.viewport.scrollTop = 624
    f.spacerController.onScroll(true)
    expect(f.space()).toBe(0)
    expect(f.viewport.scrollHeight - f.viewport.clientHeight).toBe(624)
    expect(f.viewport.scrollTop).toBe(624)
    expect(f.spacerController.start('user-1')).toBeNull()
  })

  it('does not dismiss during the initial programmatic positioning', () => {
    const f = fixture()
    f.viewport.scrollTop = 1200
    f.spacerController.start('user-1')
    f.viewport.scrollTop = 600
    f.spacerController.onScroll(false)
    expect(f.space()).toBe(376)
  })

  it('clears geometry on reload, missing rows, or disposal', () => {
    const f = fixture()
    f.spacerController.start('user-1')
    f.rows.splice(1, 1)
    f.spacerController.resize()
    expect(f.space()).toBe(0)
    f.spacerController.dispose()
    expect(f.space()).toBe(0)
  })

  it('allows a fresh spacer for a later sent message', () => {
    const f = fixture()
    f.spacerController.start('user-1')
    f.spacerController.start(undefined)
    f.user.dataset.messageKey = 'user-2'
    expect(f.spacerController.start('user-2')).toBe(1000)
    expect(f.space()).toBe(376)
  })
})
