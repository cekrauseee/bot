import { Plus, SquarePen } from 'lucide-react'

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
import type { ButtonState } from '@/components/motion/button/stateful'
import type {
  ChatUserView,
  ConversationSummary,
  ProjectSummary,
} from '@/features/chat/model'
import { CreateProjectDialog } from '../projects/create-project-dialog'
import { ProjectList } from '../projects/project-list'
import { AccountMenu } from './account-menu'
import { ConversationRow } from './conversation-row'
import { SidebarBrandHeader } from './sidebar-brand-header'

export type ChatSidebarProps = {
  user: ChatUserView
  signOutError: string
  signOutStatus: ButtonState
  conversations: ConversationSummary[]
  projects: ProjectSummary[]
  activeConversationId?: string
  onNewTask: () => void
  onProjectCreate: (name: string) => Promise<ProjectSummary>
  onConversationSelect: (conversation: ConversationSummary) => void
  onConversationMove: (conversationId: string, projectId: string | null) => Promise<void>
  onConversationDelete: (id: string) => Promise<void>
  onSignOut: () => void
}

export function ChatSidebar({
  user,
  signOutError,
  signOutStatus,
  conversations,
  projects,
  activeConversationId,
  onNewTask,
  onProjectCreate,
  onConversationSelect,
  onConversationMove,
  onConversationDelete,
  onSignOut,
}: ChatSidebarProps) {
  const recentConversations = conversations.filter((conversation) =>
    conversation.project_id === null)

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

        <span id="conversation-move-hint" className="sr-only">
          Drag this conversation onto a project folder, or use its actions menu, to move it.
        </span>

        <AnimatedSidebarGroup className="px-0 group-data-[state=collapsed]/sidebar:hidden">
          <AnimatedSidebarGroupLabel className="flex items-center justify-between ps-3.5 pe-2">
            <span>Projects</span>
            <CreateProjectDialog
              onCreate={onProjectCreate}
              trigger={(
                <button
                  type="button"
                  aria-label="Create project"
                  className="grid size-7 place-items-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <Plus aria-hidden="true" className="size-4" />
                </button>
              )}
            />
          </AnimatedSidebarGroupLabel>
          <AnimatedSidebarGroupContent>
            {projects.length ? (
              <ProjectList
                key={conversations.find((conversation) =>
                  conversation.id === activeConversationId)?.project_id ?? 'unassigned'}
                projects={projects}
                conversations={conversations}
                activeConversationId={activeConversationId}
                onConversationSelect={onConversationSelect}
                onConversationDelete={onConversationDelete}
                onMoveToProject={onConversationMove}
              />
            ) : (
              <p className="px-3.5 py-3 text-xs text-muted-foreground">
                No projects yet
              </p>
            )}
          </AnimatedSidebarGroupContent>
        </AnimatedSidebarGroup>

        <AnimatedSidebarGroup className="px-0 group-data-[state=collapsed]/sidebar:hidden">
          <AnimatedSidebarGroupLabel className="px-3.5">Recents</AnimatedSidebarGroupLabel>
          <AnimatedSidebarGroupContent>
            <div
              className="flex flex-col gap-0.5 rounded-xl px-1 data-[drop-target=true]:bg-primary/10"
              onDragOver={(event) => {
                if (!event.dataTransfer.types.includes('application/x-mybot-conversation')) return
                event.preventDefault()
                event.dataTransfer.dropEffect = 'move'
                event.currentTarget.dataset.dropTarget = 'true'
              }}
              onDragLeave={(event) => {
                if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return
                delete event.currentTarget.dataset.dropTarget
              }}
              onDrop={(event) => {
                event.preventDefault()
                delete event.currentTarget.dataset.dropTarget
                const conversationId = event.dataTransfer.getData('application/x-mybot-conversation') ||
                  event.dataTransfer.getData('text/plain')
                if (conversationId) void onConversationMove(conversationId, null).catch(() => undefined)
              }}
            >
              {recentConversations.map((conversation) => (
                <ConversationRow
                  key={conversation.id}
                  conversation={conversation}
                  projects={projects}
                  active={conversation.id === activeConversationId}
                  onSelect={onConversationSelect}
                  onDelete={onConversationDelete}
                  onMoveToProject={onConversationMove}
                />
              ))}
            </div>
            {!recentConversations.length ? (
              <p className="px-3.5 py-3 text-xs text-muted-foreground">
                No recent conversations
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
