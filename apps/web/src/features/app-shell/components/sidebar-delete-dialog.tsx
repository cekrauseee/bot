import { useState } from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Spinner } from "@/components/ui/spinner"
import { apiErrorMessage } from "@/lib/api"

type SidebarDeleteDialogProps = {
  description: string
  onConfirm: () => Promise<unknown>
  onOpenChange: (open: boolean) => void
  open: boolean
  title: string
}

export function SidebarDeleteDialog({
  description,
  onConfirm,
  onOpenChange,
  open,
  title,
}: SidebarDeleteDialogProps) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleOpenChange = (nextOpen: boolean) => {
    if (deleting) return
    setError(null)
    onOpenChange(nextOpen)
  }

  const handleDelete = async () => {
    setDeleting(true)
    setError(null)

    try {
      await onConfirm()
      setDeleting(false)
      onOpenChange(false)
    } catch (deleteError) {
      setDeleting(false)
      setError(apiErrorMessage(deleteError, "Unable to delete this item."))
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel variant="ghost" disabled={deleting}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={deleting}
            onClick={() => void handleDelete()}
          >
            {deleting && <Spinner data-icon="inline-start" />}
            {deleting ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
