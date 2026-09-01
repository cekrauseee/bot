import { useRef, useState } from "react"
import { PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { SidebarGroupAction } from "@/components/ui/sidebar"
import { Spinner } from "@/components/ui/spinner"
import { apiErrorMessage } from "@/lib/api"

type SidebarCreateProjectDialogProps = {
  onCreate: (name: string) => Promise<unknown>
}

const normalizeProjectName = (value: string) =>
  value.trim().replace(/\s+/g, " ")

export function SidebarCreateProjectDialog({
  onCreate,
}: SidebarCreateProjectDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleOpenChange = (nextOpen: boolean) => {
    if (submitting) return
    setOpen(nextOpen)
    setName("")
    setError(null)
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalized = normalizeProjectName(name)

    if (!normalized) {
      setError("Enter a project name to continue.")
      inputRef.current?.focus()
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      await onCreate(normalized)
      setSubmitting(false)
      setOpen(false)
      setName("")
    } catch (createError) {
      setSubmitting(false)
      setError(
        apiErrorMessage(
          createError,
          "Unable to create this project. Try again."
        )
      )
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <SidebarGroupAction
            aria-label="Create project"
            title="Create project"
          />
        }
      >
        <PlusIcon aria-hidden="true" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create project</DialogTitle>
          <DialogDescription>
            Create a project to organize related conversations.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => void handleSubmit(event)}
        >
          <FieldGroup>
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor="project-name">Name</FieldLabel>
              <Input
                ref={inputRef}
                id="project-name"
                name="project-name"
                value={name}
                maxLength={80}
                autoComplete="off"
                autoFocus
                disabled={submitting}
                aria-invalid={Boolean(error)}
                placeholder="Project name"
                onChange={(event) => {
                  setName(event.target.value)
                  setError(null)
                }}
              />
              <FieldError>{error}</FieldError>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose
              render={<Button variant="outline" disabled={submitting} />}
            >
              Cancel
            </DialogClose>
            <Button type="submit" disabled={submitting}>
              {submitting && <Spinner data-icon="inline-start" />}
              {submitting ? "Creating…" : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
