import { ArrowDown, ArrowUp, FolderInput, MoreHorizontal, Pencil, Pin, Trash2 } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useRef, useState, type DragEvent, type MouseEvent } from 'react'
import { Link } from 'react-router'

import { Button } from '@/components/motion/button'
import { SidebarTitle } from './sidebar-title'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import { SIDEBAR_LAYOUT_TRANSITION } from '../../motion/sidebar-motion'
import { isConversationPinned } from '../../state/pinned-conversations'
import { ConversationRenameForm } from './conversation-rename-form'
import { SidebarRowActions } from './sidebar-row-actions'
import { sidebarFocusRing, sidebarRowFocusRing, sidebarMenuSurface, sidebarMenuItem, sidebarMenuSeparator } from './sidebar-row-styles'

export const conversationDragType = 'application/x-mybot-conversation'
export const pinnedConversationDragType = 'application/x-mybot-pinned-conversation'

type ConversationRowProps = {
  conversation: ConversationSummary
  projects: ProjectSummary[]
  responsePending?: boolean
  active: boolean
  nested?: boolean
  pinPending: boolean
  onPin: (id: string, pinned: boolean) => Promise<void>
  onMoveUp?: () => void
  onMoveDown?: () => void
  onSelect: (conversation: ConversationSummary) => void
  onRename: (id: string, title: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onMoveToProject: (conversationId: string, projectId: string | null) => Promise<void>
}

export function ConversationRow({
  conversation,
  projects,
  active,
  responsePending = false,
  nested = false,
  pinPending,
  onPin,
  onMoveUp,
  onMoveDown,
  onSelect,
  onRename,
  onDelete,
  onMoveToProject,
}: ConversationRowProps) {
  const sidebar = useAnimatedSidebar()
  const reduce = useReducedMotion() ?? false
  const canTouch = useTouchCapable()
  const [menuOpen, setMenuOpen] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [titleFocused, setTitleFocused] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const linkRef = useRef<HTMLAnchorElement>(null)
  const actionsRef = useRef<HTMLDivElement>(null)
  const [actionsFocused, setActionsFocused] = useState(false)
  const actionsVisible = hovered || menuOpen || canTouch || titleFocused || actionsFocused
  const highlighted = active || hovered || menuOpen || titleFocused || actionsFocused
  const pinned = isConversationPinned(conversation)
  const moveTargets = projects.filter((project) => project.id !== conversation.project_id)
  const hasMovementActions = pinned
    ? Boolean(onMoveUp || onMoveDown)
    : moveTargets.length > 0 || conversation.project_id !== null

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
    if (pending || pinPending || editing) {
      event.preventDefault()
      return
    }
    event.dataTransfer.clearData()
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData(pinned ? pinnedConversationDragType : conversationDragType, conversation.id)
  }

  return (
    <motion.div
      layout={reduce ? false : 'position'}
      layoutId={`conversation-${conversation.id}`}
      transition={reduce ? { duration: 0 } : SIDEBAR_LAYOUT_TRANSITION}
      draggable={!pending && !pinPending && !editing && (pinned || projects.length > 0)}
      onDragStartCapture={startDrag}
      data-active={active || undefined}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      className={cn(
        'group/conversation relative flex min-h-9 min-w-0 items-center rounded-xl text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground motion-reduce:transition-none',
        highlighted && 'bg-muted text-foreground',
        sidebarRowFocusRing,
        nested && 'ms-6',
      )}
    >
      {editing ? <ConversationRenameForm
        title={conversation.title}
        onRename={(title) => onRename(conversation.id, title)}
        onClose={(restoreFocus) => {
          setEditing(false)
          if (restoreFocus) requestAnimationFrame(() => linkRef.current?.focus({ preventScroll: true }))
        }}
      /> : <>
      <Link
        ref={linkRef}
        data-sidebar-primary=""
        to={conversationPath(conversation, projects)}
        draggable={false}
        aria-current={active ? 'page' : undefined}
        aria-describedby={pinned ? 'conversation-pin-hint' : projects.length ? 'conversation-move-hint' : undefined}
        onClick={select}
        onFocus={(event) => setTitleFocused(event.currentTarget.matches(':focus-visible'))}
        onBlur={() => setTitleFocused(false)}
        className="flex min-h-9 min-w-0 flex-1 items-center rounded-xl px-2.5 py-2 outline-none"
      >
        <SidebarTitle
          title={conversation.title || 'New conversation'}
          active={hovered || menuOpen || titleFocused || actionsFocused}
          shimmer={responsePending}
          actionsRef={actionsRef}
          actionsVisible={actionsVisible}
        />
        {responsePending ? <span className="sr-only"> — Response pending</span> : null}
      </Link>
      <SidebarRowActions
        ref={actionsRef}
        visible={actionsVisible}
        highlighted={highlighted}
        onFocusCapture={(event) => setActionsFocused(event.target.matches(':focus-visible'))}
        onBlurCapture={(event) => {
          if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setActionsFocused(false)
        }}
      >
      <Button
        variant="ghost"
        size="icon"
        pressScale={0.96}
        draggable={false}
        data-pin-conversation={conversation.id}
        aria-label={`${pinned ? 'Unpin' : 'Pin'} ${conversation.title || 'conversation'}`}
        aria-pressed={pinned}
        title={pinned ? 'Unpin conversation' : 'Pin conversation'}
        disabled={pending || pinPending}
        onClick={() => void onPin(conversation.id, !pinned)}
        className={cn(
          'size-7 shrink-0 rounded-lg text-muted-foreground/70 transition-colors hover:text-foreground [&>svg]:size-3.5',
          sidebarFocusRing,
        )}
      >
        <Pin aria-hidden="true" fill={pinned ? 'currentColor' : 'none'} />
      </Button>
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
              draggable={false}
              aria-label={`Actions for ${conversation.title || 'conversation'}`}
              className={cn(
                'grid size-7 shrink-0 place-items-center rounded-lg text-muted-foreground/70 transition-colors hover:bg-foreground/5 hover:text-foreground',
                sidebarFocusRing,
              )}
            />
          }
        >
          <MoreHorizontal aria-hidden="true" className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="bottom" align="end" sideOffset={6} className={sidebarMenuSurface}>
          <DropdownMenuGroup>
            <DropdownMenuItem
              disabled={pending || pinPending}
              onClick={() => {
                setMenuOpen(false)
                setError('')
                setEditing(true)
              }}
              className={sidebarMenuItem}
            >
              <Pencil aria-hidden="true" />
              Rename conversation
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={pinPending || pending}
              onClick={() => void onPin(conversation.id, !pinned)}
              className={sidebarMenuItem}
            >
              <Pin aria-hidden="true" fill={pinned ? 'currentColor' : 'none'} />
              {pinned ? 'Unpin conversation' : 'Pin conversation'}
            </DropdownMenuItem>
          </DropdownMenuGroup>
          {hasMovementActions ? (
            <>
              <DropdownMenuSeparator className={sidebarMenuSeparator} />
              <DropdownMenuGroup>
                {pinned ? (
                  <>
                    <DropdownMenuItem disabled={pending || pinPending || !onMoveUp} onClick={onMoveUp} className={sidebarMenuItem}>
                      <ArrowUp aria-hidden="true" />
                      Move up
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={pending || pinPending || !onMoveDown} onClick={onMoveDown} className={sidebarMenuItem}>
                      <ArrowDown aria-hidden="true" />
                      Move down
                    </DropdownMenuItem>
                  </>
                ) : null}
                {!pinned && moveTargets.length ? (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className={sidebarMenuItem}>
                      <FolderInput aria-hidden="true" className="size-3.5" />
                      Move to project
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className={sidebarMenuSurface}>
                      <DropdownMenuGroup>
                        {moveTargets.map((project) => (
                          <DropdownMenuItem
                            key={project.id}
                            disabled={pending}
                            onClick={(event) => {
                              event.preventDefault()
                              void move(project.id)
                            }}
                            className={sidebarMenuItem}
                          >
                            <span className="min-w-0 flex-1 truncate">{project.name}</span>
                          </DropdownMenuItem>
                        ))}
                    </DropdownMenuGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              ) : null}
              {!pinned && conversation.project_id !== null ? (
                <DropdownMenuItem
                  disabled={pending}
                  onClick={(event) => {
                    event.preventDefault()
                    void move(null)
                  }}
                  className={sidebarMenuItem}
                >
                  <FolderInput aria-hidden="true" className="size-3.5" />
                  Move to Recents
                </DropdownMenuItem>
              ) : null}
              </DropdownMenuGroup>
              {error ? (
                <p role="alert" className="px-2 pt-1 text-xs leading-4 text-destructive">
                  {error}
                </p>
              ) : null}
            </>
          ) : null}
          <DropdownMenuSeparator className={sidebarMenuSeparator} />
          <DropdownMenuGroup>
            <DropdownMenuItem
              variant="destructive"
              onClick={(event) => {
                event.preventDefault()
                setMenuOpen(false)
                setDeleteDialogOpen(true)
              }}
              className={sidebarMenuItem}
            >
              <Trash2 aria-hidden="true" className="size-3.5" />
              Delete conversation
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      </SidebarRowActions>
      </>}
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
