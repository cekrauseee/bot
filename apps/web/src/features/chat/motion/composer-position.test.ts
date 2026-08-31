import { describe, expect, it, vi } from 'vitest'
import { createComposerPosition } from './composer-position'

function fixture() {
  const layout = { top: 0, height: 800, width: 1000, dockTop: 676, surfaceHeight: 100 }
  const style = { transform: '', willChange: '' }
  const onDockStart = vi.fn()
  let animatedY: number | null = null
  const y = () => animatedY ?? Number(/translateY\(([-\d.]+)px\)/.exec(style.transform)?.[1] ?? 0)
  const animations: { currentTime: number; onfinish: (() => void) | null; cancel: ReturnType<typeof vi.fn> }[] = []
  const surface = {
    style,
    offsetTop: 0,
    get offsetHeight() { return layout.surfaceHeight },
    getBoundingClientRect: vi.fn(() => ({ top: layout.dockTop + y(), height: layout.surfaceHeight })),
    animate: vi.fn<HTMLElement['animate']>((keyframes) => {
      const frames = keyframes as Keyframe[]
      animatedY = Number(/translateY\(([-\d.]+)px\)/.exec(String(frames[0].transform))?.[1])
      const animation = {
        currentTime: 0,
        onfinish: null as (() => void) | null,
        cancel: vi.fn(() => { animatedY = null }),
      }
      animations.push(animation)
      return animation as unknown as Animation
    }),
  }
  const dock = { getBoundingClientRect: () => ({ top: layout.dockTop, height: layout.surfaceHeight + 24 }) }
  const viewport = {
    get clientWidth() { return layout.width },
    get clientHeight() { return layout.height },
    getBoundingClientRect: () => ({ top: layout.top, height: layout.height }),
  }
  const create = () => createComposerPosition(surface, dock, viewport, onDockStart)
  return {
    layout, style, surface, animations, create, onDockStart,
    position: create(),
    advance: (translation: number, elapsed: number) => {
      animatedY = translation
      animations.at(-1)!.currentTime = elapsed
    },
  }
}

describe('native composer positioning', () => {
  it('starts the history clock only when docking, not on resize or repeated renders', () => {
    const f = fixture()
    f.position.update(true, false)
    expect(f.onDockStart).not.toHaveBeenCalled()
    f.position.update(false, false)
    f.position.update(false, false)
    f.layout.width = 850
    f.position.resize()
    f.position.update(true, false)
    expect(f.onDockStart).toHaveBeenCalledOnce()
  })
  it('keeps the native glide running through width-only sidebar animation', () => {
    const f = fixture()
    f.position.update(true, false)
    f.position.update(false, false)
    f.advance(-120, 80)
    for (const width of [980, 940, 900, 850]) {
      f.layout.width = width
      f.position.resize()
    }
    expect(f.surface.animate).toHaveBeenCalledOnce()
    expect(f.animations[0].cancel).not.toHaveBeenCalled()
  })
  it('places home before paint without an entrance, including StrictMode replay', () => {
    const f = fixture()
    f.position.update(true, false)
    expect(f.style.transform).toBe('translateY(-350px)')
    expect(f.style.willChange).toBe('transform')
    f.position.dispose()
    f.create().update(true, false)
    expect(f.style.transform).toBe('translateY(-350px)')
    expect(f.surface.animate).not.toHaveBeenCalled()
  })

  it('hands docking to one native transform animation and retains its destination after finish', () => {
    const f = fixture()
    f.position.update(true, false)
    f.position.update(false, false)
    expect(f.surface.animate).toHaveBeenCalledExactlyOnceWith([
      { transform: 'translateY(-350px)' }, { transform: 'translateY(0px)' },
    ], { duration: 240, easing: 'cubic-bezier(0.3, 0, 0.12, 1)' })
    f.animations[0].onfinish?.()
    expect(f.style.transform).toBe('translateY(0px)')
    expect(f.style.willChange).toBe('')
    expect(f.animations[0].cancel).toHaveBeenCalledOnce()
  })

  it('starts from the pre-submit top when clearing a multiline draft changes dock height', () => {
    const f = fixture()
    f.layout.surfaceHeight = 196
    f.layout.dockTop = 580
    f.position.update(true, false)
    f.position.captureSubmitPosition()
    f.layout.surfaceHeight = 100
    f.layout.dockTop = 676
    f.position.update(false, false)
    expect(f.surface.animate.mock.calls[0][0]).toEqual([
      { transform: 'translateY(-398px)' }, { transform: 'translateY(0px)' },
    ])
  })

  it('reverses from the visible in-flight transform and ignores a canceled finish callback', () => {
    const f = fixture()
    f.position.update(true, false)
    f.position.update(false, false)
    const staleFinish = f.animations[0].onfinish
    f.advance(-120, 80)
    f.position.update(true, false)
    expect(f.surface.animate.mock.calls[1][0]).toEqual([
      { transform: 'translateY(-120px)' }, { transform: 'translateY(-350px)' },
    ])
    expect(f.animations[0].cancel).toHaveBeenCalledOnce()
    staleFinish?.()
    expect(f.animations[1].cancel).not.toHaveBeenCalled()
  })

  it('does not restart on unchanged observer notifications or server conversation handoff', () => {
    const f = fixture()
    f.position.update(false, false)
    f.position.update(true, false)
    const reads = f.surface.getBoundingClientRect.mock.calls.length
    f.position.resize()
    f.position.update(true, false)
    expect(f.surface.getBoundingClientRect).toHaveBeenCalledTimes(reads)
    expect(f.surface.animate).toHaveBeenCalledOnce()
    expect(f.animations[0].cancel).not.toHaveBeenCalled()
  })

  it('rebases resizing mid-flight without moving the visible top or extending the deadline', () => {
    const f = fixture()
    f.position.update(true, false)
    f.position.update(false, false)
    f.advance(-120, 80)
    f.layout.height = 700
    f.layout.dockTop = 576
    f.position.resize()
    expect(f.surface.animate.mock.calls[1]).toEqual([
      [{ transform: 'translateY(-20px)' }, { transform: 'translateY(0px)' }],
      { duration: 160, easing: 'cubic-bezier(0.3, 0, 0.12, 1)' },
    ])
    f.advance(-10, 60)
    f.layout.surfaceHeight = 124
    f.layout.dockTop = 552
    f.position.resize()
    expect(f.surface.animate.mock.calls[2][1]).toMatchObject({ duration: 100 })
  })

  it('recenters idle typing immediately and clamps tall drafts to the dock', () => {
    const f = fixture()
    f.position.update(true, false)
    f.layout.surfaceHeight = 148
    f.layout.dockTop = 628
    f.position.resize()
    expect(f.style.transform).toBe('translateY(-326px)')
    f.layout.height = 180
    f.layout.dockTop = 8
    f.position.resize()
    expect(f.style.transform).toBe('translateY(-16px)')
    f.layout.height = 148
    f.layout.dockTop = -24
    f.position.resize()
    expect(f.style.transform).toBe('translateY(0px)')
    expect(f.surface.animate).not.toHaveBeenCalled()
  })

  it('does not retain an ancestor entrance translation across mode changes', () => {
    const f = fixture()
    f.layout.top = 12
    f.layout.dockTop += 12
    f.position.update(true, false)
    f.layout.top = 0
    f.layout.dockTop -= 12
    f.position.update(false, false)
    expect(f.surface.animate.mock.calls[0][0]).toEqual([
      { transform: 'translateY(-350px)' }, { transform: 'translateY(0px)' },
    ])
  })

  it('settles immediately when reduced motion is enabled during travel', () => {
    const f = fixture()
    f.position.update(true, false)
    f.position.update(false, false)
    f.advance(-120, 80)
    f.position.update(false, true)
    expect(f.style.transform).toBe('translateY(0px)')
    expect(f.style.willChange).toBe('')
    expect(f.animations[0].cancel).toHaveBeenCalledOnce()
    f.position.update(true, true)
    expect(f.style.transform).toBe('translateY(-350px)')
    expect(f.surface.animate).toHaveBeenCalledOnce()
  })

  it('rebases a real resize independently of a moving ancestor entrance', () => {
    const f = fixture()
    f.layout.top = 12
    f.layout.dockTop = 688
    f.position.update(true, false)
    f.position.update(false, false)
    f.advance(-120, 80)
    // The ancestor advances by 12px while the viewport shrinks by 100px.
    f.layout.top = 0
    f.layout.height = 700
    f.layout.dockTop = 576
    f.position.resize()
    expect(f.surface.animate.mock.calls[1]).toEqual([
      [{ transform: 'translateY(-20px)' }, { transform: 'translateY(0px)' }],
      { duration: 160, easing: 'cubic-bezier(0.3, 0, 0.12, 1)' },
    ])
  })

  it('removes the animation and compositing hint on disposal without losing final style', () => {
    const f = fixture()
    f.position.update(false, false)
    f.position.update(true, false)
    f.position.dispose()
    expect(f.animations[0].cancel).toHaveBeenCalledOnce()
    expect(f.animations[0].onfinish).toBeNull()
    expect(f.style.transform).toBe('translateY(-350px)')
    expect(f.style.willChange).toBe('')
  })
})
