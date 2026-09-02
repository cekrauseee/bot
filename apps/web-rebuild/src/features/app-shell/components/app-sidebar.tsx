import { useMemo, useState } from "react"
import { RefreshCwIcon, SquarePenIcon } from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import type { ConversationSummary } from "@/features/app-shell/api"
import { AccountMenu } from "@/features/provider-connections/components/account-menu"
import { SidebarConversationRow } from "@/features/app-shell/components/sidebar-conversation-row"
import { SidebarCreateProjectDialog } from "@/features/app-shell/components/sidebar-create-project-dialog"
import { SidebarProjectRow } from "@/features/app-shell/components/sidebar-project-row"
import { SidebarSkeleton } from "@/features/app-shell/components/sidebar-skeleton"
import type { SidebarCatalogController } from "@/features/app-shell/hooks/use-sidebar-catalog"
import type { User } from "@/features/auth/api"

type AppSidebarProps = {
  activeConversationId: string | null
  catalog: SidebarCatalogController
  onConversationSelect: (conversationId: string | null) => void
  onSignOut: () => void
  signingOut: boolean
  signOutFailed: boolean
  user: User
}

const newestFirst = (a: ConversationSummary, b: ConversationSummary) =>
  Date.parse(b.updated_at) - Date.parse(a.updated_at)

const swappedIds = <T extends { id: string }>(
  items: T[],
  fromIndex: number,
  toIndex: number
) => {
  const ids = items.map((item) => item.id)
  ;[ids[fromIndex], ids[toIndex]] = [ids[toIndex], ids[fromIndex]]
  return ids
}

export function AppSidebar({
  activeConversationId,
  catalog,
  onConversationSelect,
  onSignOut,
  signingOut,
  signOutFailed,
  user,
}: AppSidebarProps) {
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(
    () => new Set()
  )
  const pinnedConversations = useMemo(
    () =>
      catalog.conversations
        .filter((conversation) => conversation.pinned_order !== null)
        .sort(
          (a, b) =>
            (a.pinned_order ?? Number.MAX_SAFE_INTEGER) -
            (b.pinned_order ?? Number.MAX_SAFE_INTEGER)
        ),
    [catalog.conversations]
  )
  const recentConversations = useMemo(
    () =>
      catalog.conversations
        .filter(
          (conversation) =>
            conversation.pinned_order === null &&
            conversation.project_id === null
        )
        .sort(newestFirst),
    [catalog.conversations]
  )
  const projects = useMemo(
    () =>
      [...catalog.projects].sort(
        (a, b) =>
          (a.sort_order ?? Number.MAX_SAFE_INTEGER) -
          (b.sort_order ?? Number.MAX_SAFE_INTEGER)
      ),
    [catalog.projects]
  )

  const projectConversations = useMemo(() => {
    const groups = new Map<string, ConversationSummary[]>()
    for (const conversation of catalog.conversations) {
      if (
        conversation.project_id === null ||
        conversation.pinned_order !== null
      ) {
        continue
      }
      const group = groups.get(conversation.project_id) ?? []
      group.push(conversation)
      groups.set(conversation.project_id, group)
    }
    for (const group of groups.values()) group.sort(newestFirst)
    return groups
  }, [catalog.conversations])

  const setProjectOpen = (projectId: string, open: boolean) => {
    setExpandedProjectIds((current) => {
      const next = new Set(current)
      if (open) next.add(projectId)
      else next.delete(projectId)
      return next
    })
  }

  const moveConversation = async (
    conversationId: string,
    projectId: string | null
  ) => {
    const moved = await catalog.moveConversation(conversationId, projectId)
    if (moved && projectId !== null) setProjectOpen(projectId, true)
  }

  const conversationRow = (
    conversation: ConversationSummary,
    reorder?: {
      nested?: boolean
      onMoveDown?: () => Promise<unknown>
      onMoveUp?: () => Promise<unknown>
    }
  ) => (
    <SidebarConversationRow
      key={conversation.id}
      conversation={conversation}
      projects={projects}
      active={activeConversationId === conversation.id}
      pending={catalog.isPending("conversation", conversation.id)}
      onSelect={() => onConversationSelect(conversation.id)}
      onRename={(title) => catalog.renameConversation(conversation.id, title)}
      onDelete={() => catalog.deleteConversation(conversation.id)}
      onSetPinned={(pinned) =>
        catalog.setConversationPinned(conversation.id, pinned)
      }
      onMove={(projectId) => moveConversation(conversation.id, projectId)}
      nested={reorder?.nested}
      onMoveUp={reorder?.onMoveUp}
      onMoveDown={reorder?.onMoveDown}
    />
  )

  const hasCatalog =
    catalog.conversations.length > 0 || catalog.projects.length > 0

  return (
    <Sidebar collapsible="icon" aria-label="Application navigation">
      <SidebarHeader>
        <div className="flex h-8 items-center gap-2 px-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <span className="truncate text-sm font-semibold group-data-[collapsible=icon]:hidden">
            myBot
          </span>
          <SidebarTrigger
            className="ml-auto group-data-[collapsible=icon]:ml-0"
            aria-label="Toggle sidebar"
          />
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="New conversation"
              isActive={activeConversationId === null}
              onClick={() => onConversationSelect(null)}
            >
              <SquarePenIcon aria-hidden="true" />
              <span>New conversation</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent aria-busy={catalog.loading}>
        {catalog.loading && !hasCatalog ? (
          <SidebarSkeleton />
        ) : catalog.catalogError && !hasCatalog ? (
          <SidebarGroup>
            <SidebarGroupLabel>Unable to load</SidebarGroupLabel>
            <SidebarGroupContent>
              <p
                className="px-2 pb-2 text-xs text-destructive group-data-[collapsible=icon]:sr-only"
                role="alert"
              >
                {catalog.catalogError}
              </p>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton onClick={() => void catalog.refresh()}>
                    <RefreshCwIcon aria-hidden="true" />
                    <span>Try again</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : (
          <>
            {catalog.actionError && (
              <p
                className="mx-4 my-2 text-xs text-destructive group-data-[collapsible=icon]:sr-only"
                role="alert"
              >
                {catalog.actionError}
              </p>
            )}
            {catalog.catalogError && (
              <SidebarGroup className="pb-0">
                <SidebarGroupContent>
                  <p
                    className="px-2 text-xs text-destructive group-data-[collapsible=icon]:sr-only"
                    role="alert"
                  >
                    {catalog.catalogError}
                  </p>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        tooltip="Try loading again"
                        onClick={() => void catalog.refresh()}
                      >
                        <RefreshCwIcon aria-hidden="true" />
                        <span>Try again</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}

            {pinnedConversations.length > 0 && (
              <SidebarGroup className="group-data-[collapsible=icon]:hidden">
                <SidebarGroupLabel>Pinned</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {pinnedConversations.map((conversation, index) =>
                      conversationRow(conversation, {
                        onMoveUp:
                          index > 0
                            ? () =>
                                catalog.reorderPinnedConversations(
                                  swappedIds(
                                    pinnedConversations,
                                    index,
                                    index - 1
                                  )
                                )
                            : undefined,
                        onMoveDown:
                          index < pinnedConversations.length - 1
                            ? () =>
                                catalog.reorderPinnedConversations(
                                  swappedIds(
                                    pinnedConversations,
                                    index,
                                    index + 1
                                  )
                                )
                            : undefined,
                      })
                    )}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}

            <SidebarGroup className="group-data-[collapsible=icon]:hidden">
              <SidebarGroupLabel>Projects</SidebarGroupLabel>
              <SidebarCreateProjectDialog onCreate={catalog.createProject} />
              <SidebarGroupContent>
                <SidebarMenu>
                  {projects.length > 0 ? (
                    projects.map((project, index) => {
                      const conversations =
                        projectConversations.get(project.id) ?? []
                      return (
                        <SidebarProjectRow
                          key={project.id}
                          project={project}
                          open={expandedProjectIds.has(project.id)}
                          pending={catalog.isPending("project", project.id)}
                          conversationCount={conversations.length}
                          onOpenChange={(open) =>
                            setProjectOpen(project.id, open)
                          }
                          onRename={(name) =>
                            catalog.renameProject(project.id, name)
                          }
                          onDelete={() => catalog.deleteProject(project.id)}
                          onMoveUp={
                            index > 0
                              ? () =>
                                  catalog.reorderProjects(
                                    swappedIds(projects, index, index - 1)
                                  )
                              : undefined
                          }
                          onMoveDown={
                            index < projects.length - 1
                              ? () =>
                                  catalog.reorderProjects(
                                    swappedIds(projects, index, index + 1)
                                  )
                              : undefined
                          }
                        >
                          {conversations.map((conversation) =>
                            conversationRow(conversation, { nested: true })
                          )}
                        </SidebarProjectRow>
                      )
                    })
                  ) : (
                    <SidebarMenuItem className="flex min-h-8 items-center px-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
                      <span className="min-w-0 flex-1 truncate">
                        No projects yet
                      </span>
                    </SidebarMenuItem>
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup className="group-data-[collapsible=icon]:hidden">
              <SidebarGroupLabel>Recents</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {recentConversations.length > 0 ? (
                    recentConversations.map((conversation) =>
                      conversationRow(conversation)
                    )
                  ) : (
                    <SidebarMenuItem className="flex min-h-8 items-center px-2 text-xs text-muted-foreground">
                      <span className="min-w-0 flex-1 truncate">
                        No recent conversations
                      </span>
                    </SidebarMenuItem>
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>

      <SidebarFooter>
        {signOutFailed && (
          <p
            role="alert"
            className="px-2 text-xs text-destructive group-data-[collapsible=icon]:sr-only"
          >
            Sign out failed. Try again.
          </p>
        )}
        <SidebarMenu>
          <SidebarMenuItem>
            <AccountMenu
              user={user}
              onSignOut={onSignOut}
              signingOut={signingOut}
            />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
