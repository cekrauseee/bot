import { useState, type FormEvent, type ReactElement } from 'react'

import { Button } from '@/components/motion/button'
import { Input } from '@/components/motion/input'
import { Tooltip } from '@/components/motion/tooltip'
import { useAnimatedSidebar } from '@/components/motion/animated-sidebar-context'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import type { ProjectSummary } from '@/features/chat/model'

type CreateProjectDialogProps = {
  trigger: ReactElement
  onCreate: (name: string) => Promise<ProjectSummary>
}

export function CreateProjectDialog({ trigger, onCreate }: CreateProjectDialogProps) {
  const sidebar = useAnimatedSidebar()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)

  const close = () => {
    if (creating) return
    setOpen(false)
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalized = name.trim().replace(/\s+/g, ' ')
    if (!normalized) {
      setError('Enter a project name.')
      return
    }

    setCreating(true)
    setError('')
    try {
      await onCreate(normalized)
      setName('')
      setOpen(false)
    } catch (cause) {
      setError(cause instanceof Error
        ? cause.message
        : 'Unable to create the project. Try again.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (creating) return
        setOpen(nextOpen)
        if (!nextOpen) {
          setName('')
          setError('')
        }
      }}
    >
      <Tooltip content="Create project" side={sidebar.isMobile ? 'bottom' : 'right'}>
        <DialogTrigger render={trigger} />
      </Tooltip>
      <DialogContent showCloseButton={false} className="gap-3 p-5 sm:max-w-[25rem]">
        <DialogHeader className="gap-1.5">
          <DialogTitle>Create project</DialogTitle>
          <DialogDescription className="text-xs leading-5">
            Group related conversations in the sidebar.
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-3" onSubmit={(event) => void submit(event)}>
          <Input
            id="project-name"
            label="Project name"
            name="projectName"
            placeholder="e.g. Website redesign"
            value={name}
            maxLength={80}
            autoComplete="off"
            error={error}
            disabled={creating}
            classNames={{ field: "h-10" }}
            onChange={(value) => {
              setName(value)
              if (error) setError('')
            }}
          />
          <DialogFooter className="-mx-5 -mb-5 mt-1 p-3">
            <Button
              variant="ghost"
              size="sm"
              pressScale={0.96}
              disabled={creating}
              onClick={close}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              pressScale={0.96}
              disabled={creating}
            >
              Create project
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
