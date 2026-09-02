import { describe, expect, it } from 'vitest'
import { publicModelCatalog, validModelSelection } from '../src/modules/models.js'

describe('application-owned model catalog', () => {
  it('serializes provider capabilities and defaults without browser inference', () => {
    expect(publicModelCatalog()).toEqual({
      models: [
        expect.objectContaining({ id: 'gpt-5.6-sol', provider: 'openai', company: 'OpenAI' }),
        expect.objectContaining({ id: 'gpt-5.6-terra', provider: 'openai', company: 'OpenAI' }),
        expect.objectContaining({ id: 'gpt-5.6-luna', provider: 'openai', company: 'OpenAI' }),
        expect.objectContaining({
          id: 'grok-4.6', provider: 'xai', company: 'xAI',
          reasoning_efforts: { options: ['low', 'medium', 'high', 'xhigh'], default: 'high' },
          processing_modes: { options: ['standard'], default: 'standard' },
        }),
        expect.objectContaining({
          id: 'grok-4.3', provider: 'xai', company: 'xAI',
          reasoning_efforts: { options: ['none', 'low', 'medium', 'high'], default: 'medium' },
          processing_modes: { options: ['standard'], default: 'standard' },
        }),
        expect.objectContaining({
          id: 'glm-5.2', provider: 'openrouter', company: 'Z.ai',
          reasoning_efforts: { options: ['high', 'xhigh'], default: 'high' },
          processing_modes: { options: ['standard'], default: 'standard' },
        }),
      ],
    })
  })

  it('strictly validates cross-provider model options', () => {
    expect(validModelSelection('gpt-5.6-terra', 'max', 'fast')).toBe(true)
    expect(validModelSelection('gpt-5.6-terra', 'none', 'standard')).toBe(true)
    expect(validModelSelection('grok-4.6', 'xhigh', 'standard')).toBe(true)
    expect(validModelSelection('grok-4.3', 'none', 'standard')).toBe(true)
    expect(validModelSelection('glm-5.2', 'xhigh', 'standard')).toBe(true)
    expect(validModelSelection('grok-4.6', 'max', 'standard')).toBe(false)
    expect(validModelSelection('grok-4.6', 'high', 'fast')).toBe(false)
    expect(validModelSelection('grok-4.3', 'xhigh', 'standard')).toBe(false)
    expect(validModelSelection('grok-4.3', 'high', 'fast')).toBe(false)
    expect(validModelSelection('glm-5.2', 'medium', 'standard')).toBe(false)
    expect(validModelSelection('glm-5.2', 'high', 'fast')).toBe(false)
    expect(validModelSelection('unknown', 'medium', 'standard')).toBe(false)
  })

  it('projects provider activation onto every model owned by that provider', () => {
    const catalog = publicModelCatalog(new Map([
      ['openai', false],
      ['xai', true],
    ]))

    expect(catalog.models.filter((model) => model.provider === 'openai'))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'gpt-5.6-sol', active: false }),
        expect.objectContaining({ id: 'gpt-5.6-terra', active: false }),
        expect.objectContaining({ id: 'gpt-5.6-luna', active: false }),
      ]))
    expect(catalog.models.find((model) => model.provider === 'xai')?.active).toBe(true)
    expect(catalog.models.find((model) => model.provider === 'openrouter')?.active).toBe(true)
  })
})
