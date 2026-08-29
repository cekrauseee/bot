import {
  MoreHorizontal,
  Orbit,
  PanelLeftClose,
  PanelLeftOpen,
  SquarePen,
  Trash2,
} from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { Link } from 'react-router'

import {
  AnimatedSidebar,
  AnimatedSidebarContent,
  AnimatedSidebarFooter,
  AnimatedSidebarGroup,
  AnimatedSidebarGroupContent,
  AnimatedSidebarGroupLabel,
  AnimatedSidebarHeader,
  AnimatedSidebarMenu,
  AnimatedSidebarMenuButton,
  AnimatedSidebarMenuItem,
  AnimatedSidebarTrigger,
} from '@/components/motion/animated-sidebar'
import { useAnimatedSidebar } from '@/components/motion/animated-sidebar-context'
import { Button } from '@/components/motion/button'
import type { ButtonState } from '@/components/motion/button/stateful'
import { Tooltip } from '@/components/motion/tooltip'
import {
  MorphPopover,
  MorphPopoverContent,
  MorphPopoverTrigger,
} from '@/components/motion/popover-morph'
import type { ChatUserView, ConversationSummary } from '@/features/chat/model'
import { useTouchCapable } from '@/lib/hooks/use-touch-capable'
import { cn } from '@/lib/utils'
import { AccountMenu } from './account-menu'

export type ChatSidebarProps = {
  user: ChatUserView
  signOutError: string
  signOutStatus: ButtonState
  conversations: ConversationSummary[]
  activeConversationId?: string
  onNewTask: () => void
  onConversationSelect: (id: string) => void
  onConversationDelete: (id: string) => Promise<void>
  onSignOut: () => void
}

function SidebarBrandHeader() {
  const sidebar = useAnimatedSidebar()
  const expanded = sidebar.isMobile ? sidebar.openMobile : sidebar.open
  const [hovered, setHovered] = useState(false)
  const [focusVisible, setFocusVisible] = useState(false)
  const [suppressCollapsedHover, setSuppressCollapsedHover] = useState(false)
  const [closing, setClosing] = useState(false)
  const closeTimer = useRef<number | null>(null)
  const showToggle = !closing && (
    expanded || focusVisible || (hovered && !suppressCollapsedHover)
  )
  const showWordmark = expanded && !closing
  const fadeTransition = sidebar.reduce
    ? { duration: 0 }
    : { duration: 0.14, ease: 'easeOut' as const }
  const wordmarkTransition = sidebar.reduce
    ? { duration: 0 }
    : showWordmark
      ? { duration: 0.16, delay: 0.12, ease: 'easeOut' as const }
      : { duration: 0.1, ease: 'easeOut' as const }
  const markTransition = sidebar.reduce
    ? { duration: 0 }
    : expanded
      ? { duration: 0.08, ease: 'easeOut' as const }
      : { duration: 0.14, ease: 'easeOut' as const }

  useEffect(() => () => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current)
  }, [])

  return (
    <div
      className="relative flex h-10 w-full min-w-0 items-center"
      onPointerEnter={(event) => {
        if (event.pointerType !== 'touch') setHovered(true)
      }}
      onPointerLeave={() => {
        setHovered(false)
        setSuppressCollapsedHover(false)
      }}
    >
      <motion.span
        aria-hidden="true"
        initial={false}
        animate={{ opacity: showWordmark ? 1 : 0 }}
        transition={wordmarkTransition}
        className="pointer-events-none absolute inset-y-0 start-3.5 flex items-center whitespace-nowrap text-base font-semibold tracking-tight text-foreground"
      >
        myBot
      </motion.span>
      <motion.span
        aria-hidden="true"
        initial={false}
        animate={{
          opacity: !expanded && !showToggle ? 1 : 0,
        }}
        transition={markTransition}
        className="pointer-events-none absolute inset-y-0 start-0 grid size-11 place-items-center text-foreground"
      >
        <Orbit aria-hidden="true" className="size-5" strokeWidth={2} />
      </motion.span>
      <Tooltip
        content={expanded ? 'Close sidebar' : 'Open sidebar'}
        side={expanded ? 'bottom' : 'right'}
        wrapperClassName={cn(
          'z-10',
          expanded
            ? 'absolute end-0 top-1/2 -translate-y-1/2'
            : 'absolute inset-y-0 start-0 size-11 items-center justify-center',
        )}
      >
        <AnimatedSidebarTrigger
          aria-label={expanded ? 'Close sidebar' : 'Open sidebar'}
          onClick={(event) => {
            if (!sidebar.isMobile && expanded) {
              event.preventDefault()
              if (closing) return
              setHovered(false)
              setSuppressCollapsedHover(true)
              setClosing(true)

              if (sidebar.reduce) {
                sidebar.setOpen(false)
                setClosing(false)
                return
              }

              closeTimer.current = window.setTimeout(() => {
                sidebar.setOpen(false)
                setClosing(false)
                closeTimer.current = null
              }, 100)
            }
          }}
          onFocus={(event) => {
            setFocusVisible(event.currentTarget.matches(':focus-visible'))
          }}
          onBlur={() => setFocusVisible(false)}
          onPointerDown={(event) => {
            if (event.pointerType !== 'touch') setFocusVisible(false)
          }}
          className={cn(
            'relative size-10 rounded-xl text-muted-foreground transition-[background-color,color,opacity] duration-150 ease-out hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground focus-visible:opacity-100 motion-reduce:transition-none',
            showToggle ? 'opacity-100' : 'opacity-0',
          )}
        >
          <motion.span
            aria-hidden="true"
            initial={false}
            animate={{
              opacity: expanded ? 1 : 0,
            }}
            transition={fadeTransition}
            className="absolute inset-0 grid place-items-center"
          >
            <PanelLeftClose />
          </motion.span>
          <motion.span
            aria-hidden="true"
            initial={false}
            animate={{
              opacity: expanded ? 0 : 1,
            }}
            transition={fadeTransition}
            className="absolute inset-0 grid place-items-center"
          >
            <PanelLeftOpen />
          </motion.span>
        </AnimatedSidebarTrigger>
      </Tooltip>
    </div>
  )
}

function ConversationRow({
  conversation,
  active,
  onSelect,
  onDelete,
}: {
  conversation: ConversationSummary
  active: boolean
  onSelect: (id: string) => void
  onDelete: (id: string) => Promise<void>
}) {
  const sidebar = useAnimatedSidebar()
  const canTouch = useTouchCapable()
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  const select = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    onSelect(conversation.id)
    if (sidebar.isMobile) sidebar.setOpenMobile(false)
  }

  const remove = async () => {
    setDeleting(true)
    setError('')
    try {
      await onDelete(conversation.id)
      setMenuOpen(false)
    } catch {
      setDeleting(false)
      setError('Unable to delete this conversation. Try again.')
    }
  }

  return (
    <div
      data-active={active || undefined}
      className="group/conversation flex min-h-9 items-center gap-1 rounded-xl pr-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[active=true]:bg-muted data-[active=true]:text-foreground"
    >
      <Link
        to={`/conversations/${conversation.id}`}
        aria-current={active ? 'page' : undefined}
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
            setConfirming(false)
            setError('')
          }
        }}
      >
        <MorphPopoverTrigger>
          <button
            type="button"
            aria-label={`Actions for ${conversation.title || 'conversation'}`}
            className={cn(
              "grid size-7 shrink-0 place-items-center rounded-lg text-muted-foreground/70 outline-none transition-[color,opacity] hover:bg-foreground/5 hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover/conversation:opacity-100",
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
          {confirming ? (
            <div className="flex flex-col gap-2">
              <p className="px-1 text-xs leading-4 text-muted-foreground">
                Delete this conversation and its messages?
              </p>
              <div className="flex items-center justify-end gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={deleting}
                  onClick={() => setConfirming(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={deleting}
                  onClick={() => void remove()}
                >
                  Delete conversation
                </Button>
              </div>
              {error ? <p role="alert" className="px-1 text-xs text-destructive">{error}</p> : null}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs text-destructive outline-none transition-colors hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Trash2 aria-hidden="true" className="size-3.5" />
              Delete conversation
            </button>
          )}
        </MorphPopoverContent>
      </MorphPopover>
    </div>
  )
}

export function ChatSidebar({
  user,
  signOutError,
  signOutStatus,
  conversations,
  activeConversationId,
  onNewTask,
  onConversationSelect,
  onConversationDelete,
  onSignOut,
}: ChatSidebarProps) {
  return (
    <AnimatedSidebar collapsible="icon" ariaLabel="Conversations">
      <AnimatedSidebarHeader className="px-3">
        <SidebarBrandHeader />
      </AnimatedSidebarHeader>
      <AnimatedSidebarContent className="px-3">
        <AnimatedSidebarMenu>
          <AnimatedSidebarMenuItem>
            <AnimatedSidebarMenuButton
              icon={<SquarePen aria-hidden="true" />}
              onSelect={onNewTask}
              tooltip="New conversation"
            >
              New conversation
            </AnimatedSidebarMenuButton>
          </AnimatedSidebarMenuItem>
        </AnimatedSidebarMenu>
        <AnimatedSidebarGroup className="px-0 group-data-[state=collapsed]/sidebar:hidden">
          <AnimatedSidebarGroupLabel className="px-3.5">
            Recents
          </AnimatedSidebarGroupLabel>
          <AnimatedSidebarGroupContent>
            <div className="flex flex-col gap-0.5 px-1">
              {conversations.map((conversation) => (
                <ConversationRow
                  key={conversation.id}
                  conversation={conversation}
                  active={conversation.id === activeConversationId}
                  onSelect={onConversationSelect}
                  onDelete={onConversationDelete}
                />
              ))}
            </div>
            {!conversations.length ? (
              <p className="px-2 py-3 text-xs text-muted-foreground">
                No conversations yet
              </p>
            ) : null}
          </AnimatedSidebarGroupContent>
        </AnimatedSidebarGroup>
      </AnimatedSidebarContent>
      <AnimatedSidebarFooter>
        <AccountMenu
          user={user}
          signOutError={signOutError}
          signOutStatus={signOutStatus}
          onSignOut={onSignOut}
        />
      </AnimatedSidebarFooter>
    </AnimatedSidebar>
  )
}
