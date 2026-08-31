import { useRef, useState } from 'react'

import type { ProjectSummary } from '../model'
import { reorderIds } from '../state/sidebar-order'

export function useProjectOrder(projects: ProjectSummary[], onReorder: (ids: string[]) => Promise<void>) {
  const busy = useRef(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  const reorder = async (id: string, targetId: string, edge: 'before' | 'after') => {
    if (busy.current) return
    const ids = projects.map((project) => project.id)
    const next = reorderIds(ids, id, targetId, edge)
    if (next.every((value, index) => value === ids[index])) return
    busy.current = true
    setPending(true)
    setError('')
    try {
      await onReorder(next)
    } catch {
      setError('Unable to reorder projects. Try again.')
    } finally {
      busy.current = false
      setPending(false)
    }
  }

  return { reorder, pending, error }
}
