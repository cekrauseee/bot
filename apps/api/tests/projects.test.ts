import { describe, expect, it } from 'vitest'

import { normalizeProjectName, projectSlug } from '../src/modules/projects.js'

describe('project names and slugs', () => {
  it('normalizes whitespace, accents, punctuation, and URL-safe separators', () => {
    expect(normalizeProjectName('  Résumé   Review  ')).toBe('Résumé Review')
    expect(projectSlug('  Résumé   Review  ')).toBe('resume-review')
    expect(projectSlug('API & UI')).toBe('api-ui')
    expect(projectSlug('日本語 プロジェクト')).toBe('日本語-プロジェクト')
  })

  it('rejects names without a usable slug at the route boundary', () => {
    expect(projectSlug(' --- ')).toBe('')
  })
})
