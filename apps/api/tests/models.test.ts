import { describe, expect, it } from 'vitest'
import { publicModelCatalog, validModelSelection } from '../src/modules/models.js'

describe('application-owned model catalog', () => {
  it('serializes provider capabilities and defaults without browser inference', () => {
    expect(publicModelCatalog()).toEqual({
      models: [
        expect.objectContaining({ id: 'gpt-5.6-sol', provider: 'openai', company: 'OpenAI' }),
        expect.objectContaining({ id: 'gpt-5.6-terra', provider: 'openai', company: 'OpenAI' }),
        expect.objectContaining({ id: 'gpt-5.6-luna', provider: 'openai', company: 'OpenAI' }),
      ],
    })
  })

  it('strictly validates GPT model options', () => {
    expect(validModelSelection('gpt-5.6-terra', 'max', 'fast')).toBe(true)
    expect(validModelSelection('gpt-5.6-terra', 'none', 'standard')).toBe(true)
    expect(validModelSelection('gpt-5.6-luna', 'max', 'fast')).toBe(true)
    expect(validModelSelection('unknown', 'medium', 'standard')).toBe(false)
  })

  it('keeps API-backed models active independently of optional account connections', () => {
    const catalog = publicModelCatalog()

    expect(catalog.models.every((model) => model.active)).toBe(true)
  })
})
