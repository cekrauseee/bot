import { useEffect, useId, useRef, useState } from "react"

import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { apiErrorMessage } from "@/lib/api"

type SidebarInlineRenameProps = {
  label: string
  maxLength: number
  onCancel: () => void
  onRename: (value: string) => Promise<unknown>
  value: string
}

const normalizeName = (value: string) => value.trim().replace(/\s+/g, " ")

export function SidebarInlineRename({
  label,
  maxLength,
  onCancel,
  onRename,
  value,
}: SidebarInlineRenameProps) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const submittingRef = useRef(false)
  const [draft, setDraft] = useState(value)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalized = normalizeName(draft)

    if (!normalized) {
      setError(`Enter a ${label.toLowerCase()} to continue.`)
      inputRef.current?.focus()
      return
    }

    if (normalized === value) {
      onCancel()
      return
    }

    submittingRef.current = true
    setSubmitting(true)
    setError(null)

    try {
      await onRename(normalized)
      onCancel()
    } catch (renameError) {
      submittingRef.current = false
      setSubmitting(false)
      setError(apiErrorMessage(renameError, `Unable to rename this ${label}.`))
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      onClick={(event) => event.stopPropagation()}
      className="px-2 py-0.5"
    >
      <FieldGroup className="gap-0">
        <Field data-invalid={Boolean(error)} className="gap-1">
          <FieldLabel htmlFor={inputId} className="sr-only">
            {label}
          </FieldLabel>
          <Input
            ref={inputRef}
            id={inputId}
            value={draft}
            maxLength={maxLength}
            disabled={submitting}
            aria-invalid={Boolean(error)}
            onBlur={() => {
              if (!submittingRef.current) onCancel()
            }}
            onChange={(event) => {
              setDraft(event.target.value)
              setError(null)
            }}
            onKeyDown={(event) => {
              if (event.key !== "Escape") return
              event.preventDefault()
              onCancel()
            }}
            className="h-7"
          />
          <FieldError className="text-xs">{error}</FieldError>
        </Field>
      </FieldGroup>
    </form>
  )
}
