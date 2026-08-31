import type { Project } from '../db/repository.js'

const iso = (value: Date | string) =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString()

export const normalizeProjectName = (name: string) =>
  name.trim().replace(/\s+/g, ' ')

export const projectSlug = (name: string) => {
  const slug = normalizeProjectName(name)
    .normalize('NFKD')
    .replace(/(\p{Script=Latin})\p{Mark}+/gu, '$1')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\p{Mark}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
  return /[\p{Letter}\p{Number}]/u.test(slug) ? slug : ''
}

// Persist the initial name with the immutable ID: renames keep paths stable,
// and recreating a deleted project never adopts its previous files.
export const projectWorkspacePath = (id: string, slug: string) =>
  `/workspace/projects/${Array.from(slug).slice(0, 48).join('')}-${id}`

export const publicProject = (project: Project) => ({
  id: project.id,
  name: project.name,
  slug: project.slug,
  workspace_path: project.workspacePath,
  created_at: iso(project.createdAt),
  updated_at: iso(project.updatedAt),
})
