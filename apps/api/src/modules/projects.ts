import type { Project } from '../db/repository.js'

const iso = (value: Date | string) =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString()

export const normalizeProjectName = (name: string) =>
  name.trim().replace(/\s+/g, ' ')

export const projectSlug = (name: string) => normalizeProjectName(name)
  .normalize('NFKD')
  .replace(/(\p{Script=Latin})\p{Mark}+/gu, '$1')
  .normalize('NFC')
  .toLowerCase()
  .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 100)

export const publicProject = (project: Project) => ({
  id: project.id,
  name: project.name,
  slug: project.slug,
  created_at: iso(project.createdAt),
  updated_at: iso(project.updatedAt),
})
