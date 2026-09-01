export function reorderIds(ids: string[], draggedId: string, targetId: string, edge: 'before' | 'after') {
  if (draggedId === targetId || !ids.includes(draggedId) || !ids.includes(targetId)) return ids
  const next = ids.filter((id) => id !== draggedId)
  next.splice(next.indexOf(targetId) + (edge === 'after' ? 1 : 0), 0, draggedId)
  return next
}
