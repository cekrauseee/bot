import { describe, expect, it } from 'vitest'

import { normalizeProjectName, projectSlug, projectWorkspacePath } from '../src/modules/projects.js'

describe('project names and slugs', () => {
  it('normalizes whitespace, accents, punctuation, and URL-safe separators', () => {
    expect(normalizeProjectName('  Résumé   Review  ')).toBe('Résumé Review')
    expect(projectSlug('  Résumé   Review  ')).toBe('resume-review')
    expect(projectSlug('API & UI')).toBe('api-ui')
    expect(projectSlug('日本語 プロジェクト')).toBe('日本語-プロジェクト')
    expect(projectSlug('का कि कु')).toBe('का-कि-कु')
  })

  it('rejects names without a usable slug at the route boundary', () => {
    expect(projectSlug(' --- ')).toBe('')
    expect(projectSlug('́́')).toBe('')
  })
})

describe('project workspace paths', () => {
  it('includes the immutable project ID so recreated projects do not adopt old files', () => {
    const first = projectWorkspacePath('00000000-0000-4000-8000-000000000001', 'my-project')
    const second = projectWorkspacePath('00000000-0000-4000-8000-000000000002', 'my-project')
    expect(first).toBe('/workspace/projects/my-project-00000000-0000-4000-8000-000000000001')
    expect(first).not.toBe(second)
  })

  it('bounds the UTF-8 directory name without splitting Unicode characters', () => {
    const path = projectWorkspacePath('00000000-0000-4000-8000-000000000001', '𐐀'.repeat(100))
    expect(path).toContain('𐐀'.repeat(48))
    expect(Buffer.byteLength(path.split('/').at(-1)!)).toBeLessThanOrEqual(255)
    expect(path).not.toContain('\uFFFD')
  })
})
