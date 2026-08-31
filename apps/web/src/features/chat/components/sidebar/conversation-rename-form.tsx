import { useEffect, useId, useRef, useState } from 'react'

import { Input } from '@/components/motion/input'
import { sidebarRenameField } from './sidebar-row-styles'

export function ConversationRenameForm({ title, onRename, onClose }: {
  title: string
  onRename: (title: string) => Promise<void>
  onClose: (restoreFocus: boolean) => void
}) {
  const [draft, setDraft] = useState(title)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const busy = useRef(false)
  const errorId = useId()

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
    return () => cancelAnimationFrame(frame)
  }, [])

  const submit = async () => {
    if (busy.current) return
    const next = draft.trim().replace(/\s+/g, ' ')
    if (!next) {
      setError('Enter a conversation name.')
      return
    }
    if (next === title) { onClose(true); return }
    busy.current = true
    setPending(true)
    setError('')
    try {
      await onRename(next)
      onClose(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to rename the conversation. Try again.')
      requestAnimationFrame(() => inputRef.current?.focus())
    } finally {
      busy.current = false
      setPending(false)
    }
  }

  return (
    <form className="flex min-w-0 flex-1 flex-col gap-1 px-2.5 py-1" onSubmit={(event) => {
      event.preventDefault()
      void submit()
    }}>
      <Input
        ref={inputRef}
        aria-label={`Rename ${title || 'conversation'}`}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        value={draft}
        onChange={(value) => { setDraft(value); setError('') }}
        onBlur={() => { if (!busy.current) onClose(false) }}
        maxLength={120}
        autoComplete="off"
        disabled={pending}
        className="min-w-0 flex-1"
        classNames={{ field: sidebarRenameField, input: 'px-1 text-base sm:text-xs' }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) {
            if (event.key === 'Enter') event.preventDefault()
            return
          }
          if (event.key === 'Escape' && !busy.current) {
            event.preventDefault()
            onClose(true)
          }
        }}
      />
      {error ? <p id={errorId} role="alert" className="text-xs text-destructive">{error}</p> : null}
    </form>
  )
}
