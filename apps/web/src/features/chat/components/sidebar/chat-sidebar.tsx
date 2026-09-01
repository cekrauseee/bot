import { Plus, SquarePen } from 'lucide-react'
import { AnimatePresence, LayoutGroup } from 'motion/react'
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
import { ChatSidebarSkeleton } from '@/features/chat/components/loading/chat-sidebar-skeleton'
import { LoadingTransition } from '@/components/loading-transition'
import type { ChatUserView, ConversationSummary, ProjectSummary } from '@/features/chat/model'
import type { ResourceStatus } from '@/features/chat/state/conversation-controller'
import { CreateProjectDialog } from '../projects/create-project-dialog'
import { ProjectList } from '../projects/project-list'
import { AccountMenu } from './account-menu'
import { ConversationRow } from './conversation-row'
import { SidebarMotionItem, SidebarMotionSection } from './sidebar-motion'
import { SidebarBrandHeader } from './sidebar-brand-header'
import { ScrollDivider } from '../shared/scroll-divider'
import { useScrollBoundary } from '@/features/chat/hooks/use-scroll-boundary'
import { PageEntranceItem } from '@/components/page-entrance'
import { isConversationPinned } from '../../state/pinned-conversations'
import { usePinnedConversations } from '../../hooks/use-pinned-conversations'
import { PinnedConversationList } from './pinned-conversation-list'
import { CollapsiblePanel } from '../shared/collapsible-panel'
import { CatalogFeedback } from './catalog-feedback'
import { useAnimatedSidebar } from '@/components/motion/animated-sidebar-context'
import { sidebarSection, sidebarSectionHeader } from './sidebar-section-styles'
import { cn } from '@/lib/utils'

export type ChatSidebarProps = {
  user: ChatUserView
  signOutStatus: ButtonState
  pendingConversationIds: readonly string[]
  conversations: ConversationSummary[]
  projects: ProjectSummary[]
  catalogStatus: ResourceStatus
  catalogError: string
  activeConversationId?: string
  onCatalogRetry: () => void
  onNewTask: () => void
  onProjectReorder: (ids: string[]) => Promise<void>
  onProjectRename: (id: string, name: string) => Promise<void>
  onProjectDelete: (id: string) => Promise<void>
  onProjectCreate: (name: string) => Promise<ProjectSummary>
  onConversationSelect: (conversation: ConversationSummary) => void
  onConversationPin: (id: string, pinned: boolean) => Promise<void>
  onPinnedReorder: (ids: string[]) => Promise<void>
  onConversationMove: (conversationId: string, projectId: string | null) => Promise<void>
  onConversationRename: (id: string, title: string) => Promise<void>
  onConversationDelete: (id: string) => Promise<void>
  onSignOut: () => void
}

export function ChatSidebar({
  user,
  signOutStatus,
  pendingConversationIds,
  conversations,
  projects,
  catalogStatus,
  catalogError,
  activeConversationId,
  onCatalogRetry,
  onNewTask,
  onProjectReorder,
  onProjectRename,
  onProjectDelete,
  onProjectCreate,
  onConversationSelect,
  onConversationPin,
  onPinnedReorder,
  onConversationMove,
  onConversationRename,
  onConversationDelete,
  onSignOut,
}: ChatSidebarProps) {
  const sidebar = useAnimatedSidebar()
  const expanded = sidebar.isMobile ? sidebar.openMobile : sidebar.open
  const { scrolled: sidebarScrolled, overflowingBelow, attachViewport: attachSidebar } = useScrollBoundary()
  const pins = usePinnedConversations(conversations, onConversationPin, onPinnedReorder, onCatalogRetry)
  const unpinnedConversations = conversations.filter((conversation) => !isConversationPinned(conversation))
  const recentConversations = conversations.filter(
    (conversation) => conversation.project_id === null && !isConversationPinned(conversation),
  )
  const hasCatalogData = conversations.length > 0 || projects.length > 0
  const catalogInitialPending =
    !hasCatalogData && !catalogError && (
      catalogStatus === 'idle' ||
      catalogStatus === 'loading' ||
      catalogStatus === 'refreshing'
    )
  const catalogUnavailable = !hasCatalogData && (catalogStatus === 'error' || Boolean(catalogError))
  const catalogUpdating = hasCatalogData && catalogStatus === 'refreshing'
  const catalogRefreshError = hasCatalogData && Boolean(catalogError)
  const catalogStatusText = catalogInitialPending
    ? 'Loading conversations…'
    : catalogUpdating
      ? 'Updating conversations…'
      : catalogUnavailable || catalogRefreshError
        ? 'Unable to load conversations. You can try again.'
        : ''
  const activeProjectId = conversations.find(
    (conversation) => conversation.id === activeConversationId && !isConversationPinned(conversation),
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
    if (conversations.some((item) => item.id === conversationId && isConversationPinned(item))) return
    if (projectId) {
      setExpandedProjectIds((current) =>
        current.has(projectId) ? current : new Set(current).add(projectId),
      )
    }
    return onConversationMove(conversationId, projectId)
  }

  return (
    <AnimatedSidebar collapsible="icon" ariaLabel="Conversations">
      <AnimatedSidebarHeader className="relative gap-2 px-3 pb-2">
        <PageEntranceItem index={0} className="flex flex-col gap-2">
        <SidebarBrandHeader />
        <AnimatedSidebarMenu className="group-data-[state=collapsed]/sidebar:w-11">
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
        </PageEntranceItem>
        <ScrollDivider visible={expanded && sidebarScrolled} />
      </AnimatedSidebarHeader>
      <AnimatedSidebarContent
        ref={attachSidebar}
        className="px-3 opacity-100 transition-opacity duration-150 ease-out group-data-[state=collapsed]/sidebar:overflow-y-hidden group-data-[state=collapsed]/sidebar:opacity-0 group-data-[state=expanded]/sidebar:delay-100 motion-reduce:transition-none motion-reduce:delay-0"
        inert={!expanded}
        aria-hidden={!expanded}
        aria-busy={catalogInitialPending || catalogUpdating || undefined}
      >
        <span role="status" className="sr-only">{catalogStatusText}</span>

        <span id="conversation-move-hint" className="sr-only">
          Drag this conversation onto a project folder, or use its actions menu, to move it.
        </span>
        <span id="conversation-pin-hint" className="sr-only">
          Reorder within Pinned by dragging, or use Move up and Move down in the actions menu. Unpin to move elsewhere.
        </span>

        <PageEntranceItem index={1} className="relative min-h-0 flex-1">
          <LoadingTransition
            stateKey={catalogInitialPending ? 'loading' : catalogUnavailable ? 'error' : 'ready'}
          >
        {catalogInitialPending ? (
            <ChatSidebarSkeleton />
        ) : catalogUnavailable ? (
          <CatalogFeedback pending={catalogStatus === 'loading' || catalogStatus === 'refreshing'} onRetry={onCatalogRetry} />
        ) : (
          <>
            {catalogRefreshError ? (
              <CatalogFeedback pending={catalogUpdating} onRetry={onCatalogRetry} />
            ) : null}
            <LayoutGroup id="conversation-sidebar">
              <span role="alert" className={pins.error ? 'block px-3.5 py-2 text-xs text-destructive' : 'sr-only'}>{pins.error}</span>
              <CollapsiblePanel open={pins.pinned.length > 0} animateHeight>
                <AnimatedSidebarGroup className={cn(sidebarSection, 'pb-6')}>
                  <AnimatedSidebarGroupLabel className={sidebarSectionHeader}>
                    <h2>Pinned</h2>
                  </AnimatedSidebarGroupLabel>
                  <AnimatedSidebarGroupContent>
                    <PinnedConversationList
                      conversations={pins.pinned}
                      projects={projects}
                      activeConversationId={activeConversationId}
                      pendingConversationIds={pendingConversationIds}
                      pinPending={pins.pending}
                      onSelect={onConversationSelect}
                      onRename={onConversationRename}
                      onDelete={onConversationDelete}
                      onMoveToProject={moveConversation}
                      onPin={pins.pin}
                      onReorder={pins.reorder}
                    />
                  </AnimatedSidebarGroupContent>
                </AnimatedSidebarGroup>
              </CollapsiblePanel>
              <SidebarMotionSection className="pb-6">
                <AnimatedSidebarGroup className={sidebarSection}>
                  <AnimatedSidebarGroupLabel className={sidebarSectionHeader}>
                    <h2 data-scroll-boundary>Projects</h2>
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
                    <ProjectList
                        projects={projects}
                        pendingConversationIds={pendingConversationIds}
                        conversations={unpinnedConversations}
                        pinPending={pins.pending}
                        onConversationPin={pins.pin}
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
                        onProjectReorder={onProjectReorder}
                        onProjectRename={onProjectRename}
                        onProjectDelete={onProjectDelete}
                        onConversationSelect={onConversationSelect}
                        onConversationRename={onConversationRename}
                        onConversationDelete={onConversationDelete}
                        onMoveToProject={moveConversation}
                      />
                  </AnimatedSidebarGroupContent>
                </AnimatedSidebarGroup>
              </SidebarMotionSection>

              <SidebarMotionSection>
                <AnimatedSidebarGroup className={sidebarSection}>
                  <AnimatedSidebarGroupLabel className={sidebarSectionHeader}>
                    <h2>Recents</h2>
                  </AnimatedSidebarGroupLabel>
                  <AnimatedSidebarGroupContent>
                    <div
                      data-scroll-end={recentConversations.length ? '' : undefined}
                      className="relative flex flex-col gap-0.5 rounded-xl px-1 data-[drop-target=true]:bg-primary/10"
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
                        delete event.currentTarget.dataset.dropTarget
                        if (!event.dataTransfer.types.includes('application/x-mybot-conversation')) return
                        event.preventDefault()
                        const conversationId =
                          event.dataTransfer.getData('application/x-mybot-conversation')
                        if (conversationId)
                          void moveConversation(conversationId, null).catch(() => undefined)
                      }}
                    >
                      <AnimatePresence initial={false} mode="popLayout">
                        {recentConversations.map((conversation) => (
                          <SidebarMotionItem key={conversation.id}>
                            <ConversationRow
                              responsePending={pendingConversationIds.includes(conversation.id)}
                              conversation={conversation}
                              pinPending={pins.pending}
                              onPin={pins.pin}
                              projects={projects}
                              active={conversation.id === activeConversationId}
                              onSelect={onConversationSelect}
                              onRename={onConversationRename}
                              onDelete={onConversationDelete}
                              onMoveToProject={moveConversation}
                            />
                          </SidebarMotionItem>
                        ))}
                      {!recentConversations.length ? (
                        <SidebarMotionItem key="empty-recents">
                          <p className="px-2.5 py-2 text-xs text-muted-foreground">
                            <span data-scroll-end>No recent conversations</span>
                          </p>
                        </SidebarMotionItem>
                      ) : null}
                      </AnimatePresence>
                    </div>
                  </AnimatedSidebarGroupContent>
                </AnimatedSidebarGroup>
              </SidebarMotionSection>
            </LayoutGroup>
          </>
        )}
          </LoadingTransition>
        </PageEntranceItem>
      </AnimatedSidebarContent>
      <AnimatedSidebarFooter className="relative border-t-0">
        <ScrollDivider visible={expanded && overflowingBelow} edge="top" />
        <PageEntranceItem index={2}>
        <AccountMenu
          user={user}
          signOutStatus={signOutStatus}
          onSignOut={onSignOut}
        />
        </PageEntranceItem>
      </AnimatedSidebarFooter>
    </AnimatedSidebar>
  )
}
