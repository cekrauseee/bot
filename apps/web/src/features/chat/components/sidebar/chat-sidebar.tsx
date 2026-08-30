import { FolderKanban, History, Plus, SquarePen } from 'lucide-react'
import { LayoutGroup } from 'motion/react'
import { useEffect, useState } from 'react'

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
import type { ChatUserView, ConversationSummary, ProjectSummary } from '@/features/chat/model'
import { CreateProjectDialog } from '../projects/create-project-dialog'
import { ProjectList } from '../projects/project-list'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
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
  const recentConversations = conversations.filter(
    (conversation) => conversation.project_id === null,
  )
  const activeProjectId = conversations.find(
    (conversation) => conversation.id === activeConversationId,
  )?.project_id
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(
    () => new Set(activeProjectId ? [activeProjectId] : []),
  )
  useEffect(() => {
    if (!activeProjectId) return
    // Selecting a conversation opens its project; users can still collapse it afterward.
    // oxlint-disable-next-line react-hooks/set-state-in-effect
    setExpandedProjectIds((current) =>
      current.has(activeProjectId) ? current : new Set(current).add(activeProjectId),
    )
  }, [activeProjectId])
  const moveConversation = async (conversationId: string, projectId: string | null) => {
    if (projectId) {
      setExpandedProjectIds((current) =>
        current.has(projectId) ? current : new Set(current).add(projectId),
      )
    }
    return onConversationMove(conversationId, projectId)
  }

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

        <LayoutGroup id="conversation-sidebar">
          <AnimatedSidebarGroup className="px-0 group-data-[state=collapsed]/sidebar:hidden">
            <AnimatedSidebarGroupLabel className="flex items-center justify-between ps-3.5 pe-2">
              <span>Projects</span>
              <CreateProjectDialog
                onCreate={onProjectCreate}
                trigger={
                  <button
                    type="button"
                    aria-label="Create project"
                    className="grid size-6 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <Plus aria-hidden="true" className="size-3.5" />
                  </button>
                }
              />
            </AnimatedSidebarGroupLabel>
            <AnimatedSidebarGroupContent>
              {projects.length ? (
                <ProjectList
                  projects={projects}
                  conversations={conversations}
                  activeConversationId={activeConversationId}
                  expandedProjectIds={expandedProjectIds}
                  onProjectToggle={(projectId) =>
                    setExpandedProjectIds((current) => {
                      const next = new Set(current)
                      if (next.has(projectId)) next.delete(projectId)
                      else next.add(projectId)
                      return next
                    })
                  }
                  onConversationSelect={onConversationSelect}
                  onConversationDelete={onConversationDelete}
                  onMoveToProject={moveConversation}
                />
              ) : (
                <Empty className="flex-none gap-2 rounded-lg border-0 px-3.5 py-3 text-left">
                  <EmptyHeader className="w-full max-w-none flex-row items-center gap-2">
                    <EmptyMedia variant="icon" className="mb-0 size-7 rounded-md">
                      <FolderKanban aria-hidden="true" className="size-3.5" />
                    </EmptyMedia>
                    <div className="min-w-0">
                      <EmptyTitle className="text-xs">No projects yet</EmptyTitle>
                      <EmptyDescription className="text-xs leading-4">
                        Create one to organize conversations.
                      </EmptyDescription>
                    </div>
                  </EmptyHeader>
                </Empty>
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
                  if (
                    event.relatedTarget instanceof Node &&
                    event.currentTarget.contains(event.relatedTarget)
                  )
                    return
                  delete event.currentTarget.dataset.dropTarget
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  delete event.currentTarget.dataset.dropTarget
                  const conversationId =
                    event.dataTransfer.getData('application/x-mybot-conversation') ||
                    event.dataTransfer.getData('text/plain')
                  if (conversationId)
                    void moveConversation(conversationId, null).catch(() => undefined)
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
                    onMoveToProject={moveConversation}
                  />
                ))}
              </div>
              {!recentConversations.length ? (
                <Empty className="flex-none gap-2 rounded-lg border-0 px-3.5 py-3 text-left">
                  <EmptyHeader className="w-full max-w-none flex-row items-center gap-2">
                    <EmptyMedia variant="icon" className="mb-0 size-7 rounded-md">
                      <History aria-hidden="true" className="size-3.5" />
                    </EmptyMedia>
                    <div className="min-w-0">
                      <EmptyTitle className="text-xs">No recent conversations</EmptyTitle>
                      <EmptyDescription className="text-xs leading-4">
                        Start a new conversation to see it here.
                      </EmptyDescription>
                    </div>
                  </EmptyHeader>
                </Empty>
              ) : null}
            </AnimatedSidebarGroupContent>
          </AnimatedSidebarGroup>
        </LayoutGroup>
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
