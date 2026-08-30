import {
  ArrowLeft,
  FolderInput,
  MoreHorizontal,
  Trash2,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
} from 'react'
import { Link } from 'react-router'

import { Button } from '@/components/motion/button'
import {
  MorphPopover,
  MorphPopoverContent,
  MorphPopoverTrigger,
} from '@/components/motion/popover-morph'
import { useAnimatedSidebar } from '@/components/motion/animated-sidebar-context'
import { conversationPath } from '@/features/chat/conversation-path'
import type { ConversationSummary, ProjectSummary } from '@/features/chat/model'
import { useTouchCapable } from '@/lib/hooks/use-touch-capable'
import { cn } from '@/lib/utils'

export const conversationDragType = 'application/x-mybot-conversation'

type ConversationRowProps = {
  conversation: ConversationSummary
  projects: ProjectSummary[]
  active: boolean
  nested?: boolean
  onSelect: (conversation: ConversationSummary) => void
  onDelete: (id: string) => Promise<void>
  onMoveToProject: (conversationId: string, projectId: string | null) => Promise<void>
}

type MenuView = 'actions' | 'projects' | 'delete'

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
  const canTouch = useTouchCapable()
  const [menuOpen, setMenuOpen] = useState(false)
  const [view, setView] = useState<MenuView>('actions')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const triggerRef = useRef<HTMLButtonElement>(null)
  const focusObserverRef = useRef<MutationObserver | null>(null)
  const moveTargets = projects.filter((project) => project.id !== conversation.project_id)
  const focusOnMount = useCallback((node: HTMLButtonElement | null) => {
    focusObserverRef.current?.disconnect()
    focusObserverRef.current = null
    if (!node) return
    const portal = node.closest<HTMLElement>('[data-morph-popover-portal]')
    const focus = () => {
      if (!node.isConnected || (portal && getComputedStyle(portal).visibility === 'hidden')) {
        return false
      }
      node.focus()
      return true
    }
    if (focus() || !portal) return
    const observer = new MutationObserver(() => {
      if (!focus()) return
      observer.disconnect()
      focusObserverRef.current = null
    })
    observer.observe(portal, { attributes: true, attributeFilter: ['style'] })
    focusObserverRef.current = observer
  }, [])

  useEffect(() => () => focusObserverRef.current?.disconnect(), [])

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
      setMenuOpen(false)
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

  const startDrag = (event: DragEvent<HTMLAnchorElement>) => {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData(conversationDragType, conversation.id)
    event.dataTransfer.setData('text/plain', conversation.id)
  }

  return (
    <div
      data-active={active || undefined}
      className={cn(
        'group/conversation flex min-h-9 items-center gap-1 rounded-xl pe-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[active=true]:bg-muted data-[active=true]:text-foreground',
        nested && 'ms-6',
      )}
    >
      <Link
        to={conversationPath(conversation, projects)}
        draggable={projects.length > 0}
        onDragStart={startDrag}
        aria-current={active ? 'page' : undefined}
        aria-describedby={projects.length ? 'conversation-move-hint' : undefined}
        onClick={select}
        className="min-w-0 flex-1 truncate rounded-lg px-2.5 py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {conversation.title || 'New conversation'}
      </Link>
      <MorphPopover
        open={menuOpen}
        onOpenChange={(open) => {
          setMenuOpen(open)
          if (!open) {
            setView('actions')
            setPending(false)
            setError('')
          }
        }}
      >
        <MorphPopoverTrigger>
          <button
            type="button"
            ref={triggerRef}
            aria-label={`Actions for ${conversation.title || 'conversation'}`}
            className={cn(
              'grid size-7 shrink-0 place-items-center rounded-lg text-muted-foreground/70 outline-none transition-[color,opacity] hover:bg-foreground/5 hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover/conversation:opacity-100',
              canTouch || menuOpen ? 'opacity-100' : 'opacity-0',
            )}
          >
            <MoreHorizontal aria-hidden="true" className="size-4" />
          </button>
        </MorphPopoverTrigger>
        <MorphPopoverContent
          side="bottom"
          align="end"
          sideOffset={6}
          radius={12}
          className="w-56 p-2"
        >
          {view === 'actions' ? (
            <div className="flex flex-col gap-0.5">
              {moveTargets.length ? (
                <button
                  type="button"
                  ref={focusOnMount}
                  onClick={() => setView('projects')}
                  className="flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <FolderInput aria-hidden="true" className="size-3.5" />
                  Move to project
                </button>
              ) : null}
              {conversation.project_id !== null ? (
                <button
                  type="button"
                  ref={!moveTargets.length ? focusOnMount : undefined}
                  onClick={() => void move(null)}
                  className="flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <FolderInput aria-hidden="true" className="size-3.5" />
                  Move to Recents
                </button>
              ) : null}
              <button
                type="button"
                ref={!moveTargets.length && conversation.project_id === null
                  ? focusOnMount
                  : undefined}
                onClick={() => setView('delete')}
                className="flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs text-destructive outline-none transition-colors hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Trash2 aria-hidden="true" className="size-3.5" />
                Delete conversation
              </button>
            </div>
          ) : null}

          {view === 'projects' ? (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1 px-0.5 pb-1">
                <button
                  type="button"
                  aria-label="Back to conversation actions"
                  ref={focusOnMount}
                  onClick={() => setView('actions')}
                  className="grid size-7 place-items-center rounded-lg text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ArrowLeft aria-hidden="true" className="size-3.5" />
                </button>
                <p className="text-xs font-medium text-foreground">Move to project</p>
              </div>
              {moveTargets.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  disabled={pending}
                  onClick={() => void move(project.id)}
                  className="h-8 w-full truncate rounded-lg px-2.5 text-left text-xs text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                >
                  {project.name}
                </button>
              ))}
              {error ? <p role="alert" className="px-1 pt-1 text-xs text-destructive">{error}</p> : null}
            </div>
          ) : null}

          {view === 'delete' ? (
            <div className="flex flex-col gap-2">
              <p className="px-1 text-xs leading-4 text-muted-foreground">
                Delete this conversation and its messages?
              </p>
              <div className="flex items-center justify-end gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  pressScale={0.96}
                  ref={focusOnMount}
                  disabled={pending}
                  onClick={() => setView('actions')}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  pressScale={0.96}
                  disabled={pending}
                  onClick={() => void remove()}
                >
                  Delete conversation
                </Button>
              </div>
              {error ? <p role="alert" className="px-1 text-xs text-destructive">{error}</p> : null}
            </div>
          ) : null}
        </MorphPopoverContent>
      </MorphPopover>
    </div>
  )
}
