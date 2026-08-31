import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { ResponseError } from './response-error'

vi.stubGlobal('React', React)
afterAll(() => vi.unstubAllGlobals())

describe('response error surface', () => {
  it('shows a destructive Retry again action after a failed retry', () => {
    const markup = renderToStaticMarkup(React.createElement(ResponseError, {
      message: 'Second failure.', onRetry: () => {}, retryFailed: true,
    }))
    expect(markup).toContain('Second failure.')
    expect(markup).toContain('Retry again')
    const button = markup.match(/<button\b[^>]*>/)?.[0]
    expect(button).toContain('text-destructive')
    expect(button).toContain('bg-destructive/10')
    expect(markup).not.toContain('disabled=""')
  })
  it('shows the same concise explanation with or without retry', () => {
    for (const onRetry of [undefined, () => {}]) {
      const markup = renderToStaticMarkup(React.createElement(ResponseError, { message: 'Service unavailable.', onRetry }))
      expect(markup).toContain('Response failed')
      expect(markup).toContain('Service unavailable.')
      expect(markup).not.toContain('Your prompt is kept')
      expect(markup.includes('<button')).toBe(Boolean(onRetry))
    }
  })

  it('retains the error and a busy disabled action during retry', () => {
    const markup = renderToStaticMarkup(React.createElement(ResponseError, {
      message: 'Service unavailable.', onRetry: () => {}, retrying: true,
    }))
    expect(markup).toContain('Service unavailable.')
    expect(markup).toContain('aria-busy="true"')
    expect(markup).toContain('disabled=""')
    expect(markup).toContain('Retrying…')
  })
})
