import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { ComposerSubmitAction } from './composer-submit-action'

vi.stubGlobal('React', React)
afterAll(() => vi.unstubAllGlobals())

const base = { centered: true, loading: false, canSubmit: true, error: '', errorId: 'prompt-error', onStop: () => {} }
const buttons = (markup: string) => markup.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? []

describe('shared composer submit action', () => {
  it('keeps idle and loading icon-only without mounting a measured text slot', () => {
    for (const loading of [false, true]) {
      const markup = renderToStaticMarkup(React.createElement(ComposerSubmitAction, { ...base, loading }))
      expect(buttons(markup)).toHaveLength(1)
      const primary = buttons(markup).at(-1)!
      expect(primary).toContain(loading ? 'aria-label="Cancel request"' : 'aria-label="Send prompt"')
      expect(primary).not.toContain('data-slot="stateful-label"')
      expect(primary).not.toContain('disabled=""')
      expect(primary).toContain(loading ? 'type="button"' : 'type="submit"')
    }
  })

  it('keeps a streaming Stop action enabled even with an empty draft', () => {
    const markup = renderToStaticMarkup(React.createElement(ComposerSubmitAction, { ...base, centered: false, loading: true, canSubmit: false }))
    const [button] = buttons(markup)
    expect(button).toContain('type="button"')
    expect(button).toContain('aria-label="Stop generating"')
    expect(button).toContain('aria-busy="true"')
    expect(button).not.toContain('disabled=""')
    expect(button).not.toContain('animate-spin')
  })

  it('disables Stop when no cancellation handler exists', () => {
    const markup = renderToStaticMarkup(React.createElement(ComposerSubmitAction, { ...base, centered: false, loading: true, onStop: undefined }))
    expect(buttons(markup)[0]).toContain('disabled=""')
  })

  it('uses translated accessible names and retry text supplied by its caller', () => {
    const markup = renderToStaticMarkup(React.createElement(ComposerSubmitAction, {
      ...base, error: 'Não foi possível enviar.', labels: {
        send: 'Enviar', starting: 'A iniciar', stop: 'Parar', cancel: 'Cancelar', retry: 'Tentar novamente',
      },
    }))
    const [button] = buttons(markup)
    expect(button).toContain('aria-label="Tentar novamente"')
    expect(button).toContain('Tentar novamente')
    expect(button).toContain('bg-destructive/10')
    expect(button).toContain('data-slot="stateful-label"')
  })
})
