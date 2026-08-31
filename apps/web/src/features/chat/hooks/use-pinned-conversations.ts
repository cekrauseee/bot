import { useRef, useState } from 'react'

import type { ConversationSummary } from '../model'
import { pinnedConversations } from '../state/pinned-conversations'
import { reorderIds } from '../state/sidebar-order'

export function usePinnedConversations(
  conversations: ConversationSummary[],
  onPin: (id: string, pinned: boolean) => Promise<void>,
  onReorder: (ids: string[]) => Promise<void>,
  onConflict: () => void,
) {
  const busy = useRef(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const pinned = pinnedConversations(conversations)

  const mutate = async (operation: () => Promise<void>) => {
    if (busy.current) return
    busy.current = true
    setPending(true)
    setError('')
    try {
      await operation()
    } catch {
      setError('Unable to update pinned conversations. Try again.')
      onConflict()
    } finally {
      busy.current = false
      setPending(false)
    }
  }

  const pin = async (id: string, value: boolean) => {
    const restoreFocus = document.activeElement?.getAttribute('data-pin-conversation') === id &&
      document.activeElement.matches(':focus-visible')
    await mutate(() => onPin(id, value))
    if (restoreFocus) requestAnimationFrame(() => {
      const button = [...document.querySelectorAll<HTMLButtonElement>('[data-pin-conversation]')]
        .find((element) => element.dataset.pinConversation === id && !element.closest('[inert]'))
      button?.focus({ preventScroll: true })
    })
  }

  const reorder = (id: string, targetId: string, edge: 'before' | 'after') => {
    const ids = pinned.map((conversation) => conversation.id)
    const next = reorderIds(ids, id, targetId, edge)
    if (next.every((value, index) => value === ids[index])) return
    void mutate(() => onReorder(next))
  }

  return { pinned, pending, error, pin, reorder }
}
