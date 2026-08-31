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
  })
})
