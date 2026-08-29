import { MessageSquarePlus, MoreHorizontal, Trash2 } from 'lucide-react'
import { useState, type MouseEvent } from 'react'
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
} from '@/components/motion/animated-sidebar'
import { useAnimatedSidebar } from '@/components/motion/animated-sidebar-context'
import { Button } from '@/components/motion/button'
import type { ButtonState } from '@/components/motion/button/stateful'
import {
  MorphPopover,
  MorphPopoverContent,
  MorphPopoverTrigger,
} from '@/components/motion/popover-morph'
import type { ChatUserView, ConversationSummary } from '@/features/chat/model'
import { AccountMenu } from './account-menu'
import { groupConversations } from './conversation-groups'

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
            className="grid size-7 shrink-0 place-items-center rounded-lg text-muted-foreground/70 opacity-70 outline-none transition-[color,opacity] hover:bg-foreground/5 hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover/conversation:opacity-100"
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
  const groups = groupConversations(conversations, new Date(), 'en')
  return (
    <AnimatedSidebar collapsible="icon" ariaLabel="Conversations">
      <AnimatedSidebarHeader>
        <AnimatedSidebarMenu>
          <AnimatedSidebarMenuItem>
            <AnimatedSidebarMenuButton
              icon={<MessageSquarePlus aria-hidden="true" />}
              onSelect={onNewTask}
            >
              New conversation
            </AnimatedSidebarMenuButton>
          </AnimatedSidebarMenuItem>
        </AnimatedSidebarMenu>
      </AnimatedSidebarHeader>
      <AnimatedSidebarContent>
        {groups.map((group) => (
          <AnimatedSidebarGroup key={group.label}>
            <AnimatedSidebarGroupLabel>{group.label}</AnimatedSidebarGroupLabel>
            <AnimatedSidebarGroupContent>
              <div className="flex flex-col gap-0.5 px-1">
                {group.conversations.map((conversation) => (
                  <ConversationRow
                    key={conversation.id}
                    conversation={conversation}
                    active={conversation.id === activeConversationId}
                    onSelect={onConversationSelect}
                    onDelete={onConversationDelete}
                  />
                ))}
              </div>
            </AnimatedSidebarGroupContent>
          </AnimatedSidebarGroup>
        ))}
        {!groups.length ? (
          <p className="px-4 py-3 text-xs text-muted-foreground">
            No conversations yet
          </p>
        ) : null}
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
