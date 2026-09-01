import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { AgentActivity } from './index'
import type { AgentActivityItem } from './types'

vi.stubGlobal('React', React)
afterAll(() => vi.unstubAllGlobals())

const items: AgentActivityItem[] = Array.from({ length: 400 }, (_, index) => ({
  id: `step-${index}`, type: 'step', label: `Reviewed source file ${index}`, status: 'complete',
}))

describe('activity render cost', () => {
  it('keeps a collapsed process accessible without mounting its hidden rows', () => {
    const markup = renderToStaticMarkup(React.createElement(AgentActivity, { items, status: 'complete' }))
    expect(markup).toContain('aria-expanded="false"')
    expect(markup).toContain('aria-controls=')
    expect(markup).not.toContain('role="listitem"')
    expect(markup).not.toContain('Reviewed source file')
  })

  it('keeps active work static and adds disclosure semantics only after completion', () => {
    const working = renderToStaticMarkup(React.createElement(AgentActivity, { items, status: 'working' }))
    const complete = renderToStaticMarkup(React.createElement(AgentActivity, { items, status: 'complete' }))

    expect(working).not.toContain('<button')
    expect(working).not.toContain('aria-expanded=')
    expect(working).not.toContain('<svg')
    expect(complete).toContain('<button')
    expect(complete).toContain('aria-expanded="false"')
    expect(complete).toContain('<svg')
  })

  it('renders a non-trigger status without a chevron when there are no steps', () => {
    const markup = renderToStaticMarkup(React.createElement(AgentActivity, {
      items: [], status: 'complete', summary: 'Processed for 4s',
    }))

    expect(markup).toContain('Processed for 4s')
    expect(markup).not.toContain('<button')
    expect(markup).not.toContain('aria-controls=')
    expect(markup).not.toContain('<svg')
  })

  it('moves the separator after the disclosure content when work completes', () => {
    const working = renderToStaticMarkup(React.createElement(AgentActivity, {
      items: items.slice(0, 1), status: 'working', separated: true,
    }))
    const complete = renderToStaticMarkup(React.createElement(AgentActivity, {
      items: items.slice(0, 1), status: 'complete', defaultOpen: true, separated: true,
    }))

    expect(working).toContain('bg-border/70 order-1')
    expect(working).toContain('order-2 duration-[220ms]')
    expect(complete).toContain('bg-border/70 order-2')
    expect(complete).toContain('order-1 duration-[220ms]')
  })

  it('does not execute hidden content components while collapsed', () => {
    function ExpensiveContent(): never { throw new Error('Hidden content must not mount') }
    expect(() => renderToStaticMarkup(React.createElement(AgentActivity, {
      status: 'complete', items: [{ id: 'hidden', type: 'text', content: React.createElement(ExpensiveContent) }],
    }))).not.toThrow()
  })

  it.each(['working', 'complete'] as const)('renders every row when expanded in %s state', (status) => {
    const markup = renderToStaticMarkup(React.createElement(AgentActivity, { items, status, defaultOpen: true }))
    expect((markup.match(/role="listitem"/g) ?? []).length).toBe(400)
    expect(markup).toContain('Reviewed source file 399')
    expect(markup).not.toContain('data-slot="message-scroller"')
    expect(markup).not.toContain('aria-label="Scroll to bottom"')
  })
})
