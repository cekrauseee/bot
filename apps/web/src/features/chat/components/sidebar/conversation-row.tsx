import { FolderInput, MoreHorizontal, Trash2 } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useState, type DragEvent, type MouseEvent } from 'react'
import { Link } from 'react-router'

import { Button } from '@/components/motion/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useAnimatedSidebar } from '@/components/motion/animated-sidebar-context'
import { conversationPath } from '@/features/chat/conversation-path'
import type { ConversationSummary, ProjectSummary } from '@/features/chat/model'
import { useTouchCapable } from '@/lib/hooks/use-touch-capable'
import { cn } from '@/lib/utils'

export const conversationDragType = 'application/x-mybot-conversation'

const CONVERSATION_RELOCATION_TRANSITION = {
  type: 'spring',
  duration: 0.24,
  bounce: 0,
} as const

type ConversationRowProps = {
  conversation: ConversationSummary
  projects: ProjectSummary[]
  active: boolean
  nested?: boolean
  onSelect: (conversation: ConversationSummary) => void
  onDelete: (id: string) => Promise<void>
  onMoveToProject: (conversationId: string, projectId: string | null) => Promise<void>
}

export function ConversationRow({
  conversation,
  projects,
  active,
  nested = false,
  onSelect,
  onDelete,
  onMoveToProject,
}: ConversationRowProps) {
  const sidebar = useAnimatedSidebar()
  const reduce = useReducedMotion() ?? false
  const canTouch = useTouchCapable()
  const [menuOpen, setMenuOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const moveTargets = projects.filter((project) => project.id !== conversation.project_id)

  const select = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    onSelect(conversation)
    if (sidebar.isMobile) sidebar.setOpenMobile(false)
  }

  const remove = async () => {
    setPending(true)
    setError('')
    try {
      await onDelete(conversation.id)
      setDeleteDialogOpen(false)
    } catch {
      setPending(false)
      setError('Unable to delete this conversation. Try again.')
    }
  }

  const move = async (projectId: string | null) => {
    setPending(true)
    setError('')
    try {
      await onMoveToProject(conversation.id, projectId)
      setMenuOpen(false)
    } catch {
      setPending(false)
      setError('Unable to move this conversation. Try again.')
    }
  }

  const startDrag = (event: DragEvent<HTMLElement>) => {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData(conversationDragType, conversation.id)
    event.dataTransfer.setData('text/plain', conversation.id)
  }

  return (
    <motion.div
      layout={reduce ? false : 'position'}
      layoutId={`conversation-${conversation.id}`}
      transition={reduce ? { duration: 0 } : CONVERSATION_RELOCATION_TRANSITION}
      draggable={projects.length > 0}
      onDragStartCapture={startDrag}
      data-active={active || undefined}
      className={cn(
        'group/conversation flex min-h-9 items-center gap-1 overflow-hidden rounded-xl pe-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[active=true]:bg-muted data-[active=true]:text-foreground motion-reduce:transition-none',
        nested && 'ms-6',
      )}
    >
      <Link
        to={conversationPath(conversation, projects)}
        aria-current={active ? 'page' : undefined}
        aria-describedby={projects.length ? 'conversation-move-hint' : undefined}
        onClick={select}
        className="min-w-0 flex-1 truncate rounded-lg px-2.5 py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {conversation.title || 'New conversation'}
      </Link>
      <DropdownMenu
        open={menuOpen}
        onOpenChange={(open) => {
          setMenuOpen(open)
          if (!open) {
            setPending(false)
            setError('')
          }
        }}
      >
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              aria-label={`Actions for ${conversation.title || 'conversation'}`}
              className={cn(
                'grid size-7 shrink-0 place-items-center rounded-lg text-muted-foreground/70 outline-none transition-[color,opacity] hover:bg-foreground/5 hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover/conversation:opacity-100',
                canTouch || menuOpen ? 'opacity-100' : 'opacity-0',
              )}
            />
          }
        >
          <MoreHorizontal aria-hidden="true" className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="bottom" align="end" sideOffset={6} className="w-56 p-2">
          <DropdownMenuGroup>
            {moveTargets.length ? (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="h-8 text-xs">
                  <FolderInput aria-hidden="true" className="size-3.5" />
                  Move to project
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="max-w-56">
                  <DropdownMenuGroup>
                    {moveTargets.map((project) => (
                      <DropdownMenuItem
                        key={project.id}
                        disabled={pending}
                        onClick={(event) => {
                          event.preventDefault()
                          void move(project.id)
                        }}
                        className="h-8 truncate text-xs"
                      >
                        {project.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            ) : null}
            {conversation.project_id !== null ? (
              <DropdownMenuItem
                disabled={pending}
                onClick={(event) => {
                  event.preventDefault()
                  void move(null)
                }}
                className="h-8 text-xs"
              >
                <FolderInput aria-hidden="true" className="size-3.5" />
                Move to Recents
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem
              variant="destructive"
              onClick={(event) => {
                event.preventDefault()
                setMenuOpen(false)
                setDeleteDialogOpen(true)
              }}
              className="h-8 text-xs"
            >
              <Trash2 aria-hidden="true" className="size-3.5" />
              Delete conversation
            </DropdownMenuItem>
          </DropdownMenuGroup>
          {error ? (
            <p role="alert" className="px-1 pt-1 text-xs text-destructive">
              {error}
            </p>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open)
          if (!open) {
            setPending(false)
            setError('')
          }
        }}
      >
        <DialogContent showCloseButton={false} className="gap-3">
          <DialogHeader className="gap-1.5">
            <DialogTitle>Delete conversation?</DialogTitle>
            <DialogDescription className="text-xs leading-5">
              Delete this conversation and its messages?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="-mx-4 -mb-4 p-3">
            <Button
              variant="ghost"
              size="sm"
              pressScale={0.96}
              disabled={pending}
              onClick={() => setDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button size="sm" pressScale={0.96} disabled={pending} onClick={() => void remove()}>
              Delete conversation
            </Button>
          </DialogFooter>
          {error ? (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
