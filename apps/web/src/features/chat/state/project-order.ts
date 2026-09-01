import type { ProjectSummary } from '../model'

export const orderedProjects = (projects: ProjectSummary[]) => [...projects].sort((left, right) => {
  if (left.sort_order == null && right.sort_order != null) return -1
  if (right.sort_order == null && left.sort_order != null) return 1
  return (left.sort_order ?? 0) - (right.sort_order ?? 0) ||
    Date.parse(right.created_at) - Date.parse(left.created_at) || right.id.localeCompare(left.id)
})

/** Rename and order responses can arrive independently. Preserve both clocks. */
export function mergeProject(current: ProjectSummary | undefined, incoming: ProjectSummary): ProjectSummary {
  if (!current) return incoming
  const content = Date.parse(current.updated_at) > Date.parse(incoming.updated_at) ? current : incoming
  const order = (Date.parse(current.order_updated_at ?? '') || 0) >
    (Date.parse(incoming.order_updated_at ?? '') || 0) ? current : incoming
  return { ...content, sort_order: order.sort_order, order_updated_at: order.order_updated_at }
}
