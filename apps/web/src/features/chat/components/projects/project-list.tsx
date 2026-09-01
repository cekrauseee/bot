import { AnimatePresence, useReducedMotion } from 'motion/react'
import { useState, type DragEvent } from 'react'

import type { ConversationSummary, ProjectSummary } from '@/features/chat/model'
import { SIDEBAR_FADE_TRANSITION } from '../../motion/sidebar-motion'
import { CollapsiblePanel } from '../shared/collapsible-panel'
import { SidebarMotionItem, SidebarMotionListItem } from '../sidebar/sidebar-motion'
import { cn } from '@/lib/utils'
import { ProjectRow, projectDragType } from './project-row'
import { useProjectOrder } from '../../hooks/use-project-order'
import { ConversationRow, conversationDragType } from '../sidebar/conversation-row'

type ProjectListProps = {
  projects: ProjectSummary[]
  pendingConversationIds: readonly string[]
  conversations: ConversationSummary[]
  activeConversationId?: string
  pinPending: boolean
  onConversationPin: (id: string, pinned: boolean) => Promise<void>
  expandedProjectIds: Set<string>
  onProjectRename: (id: string, name: string) => Promise<void>
  onProjectReorder: (ids: string[]) => Promise<void>
  onProjectDelete: (id: string) => Promise<void>
  onProjectToggle: (projectId: string) => void
  onConversationSelect: (conversation: ConversationSummary) => void
  onConversationRename: (id: string, title: string) => Promise<void>
  onConversationDelete: (id: string) => Promise<void>
  onMoveToProject: (conversationId: string, projectId: string | null) => Promise<void>
}

export function ProjectList({
  projects,
  pendingConversationIds,
  conversations,
  activeConversationId,
  pinPending,
  onConversationPin,
  expandedProjectIds,
  onProjectToggle,
  onProjectRename,
  onProjectReorder,
  onProjectDelete,
  onConversationSelect,
  onConversationRename,
  onConversationDelete,
  onMoveToProject,
}: ProjectListProps) {
  const reduce = useReducedMotion() ?? false
  const [moveError, setMoveError] = useState<Record<string, string>>({})
  const order = useProjectOrder(projects, onProjectReorder)
  const [drop, setDrop] = useState<{ id: string; edge: 'before' | 'after' } | null>(null)
  const projectDropEdge = (event: DragEvent<HTMLElement>) => {
    const row = event.currentTarget.querySelector('[data-project-row]') ?? event.currentTarget
    const bounds = row.getBoundingClientRect()
    return event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after'
  }

  const move = async (conversationId: string, projectId: string | null) => {
    const conversation = conversations.find((item) => item.id === conversationId)
    if (!conversation || conversation.project_id === projectId) return
    if (projectId === null) return onMoveToProject(conversationId, null)
    setMoveError((current) => ({ ...current, [projectId]: '' }))
    try {
      await onMoveToProject(conversationId, projectId)
    } catch {
      setMoveError((current) => ({
        ...current,
        [projectId]: 'Unable to move the conversation. Try again.',
      }))
      throw new Error('Unable to move the conversation.')
    }
  }

  const draggedConversationId = (event: DragEvent<HTMLElement>) =>
    event.dataTransfer.getData(conversationDragType)

  return (
    <div className="relative flex flex-col gap-0.5 px-1" onDragEnd={() => setDrop(null)}>
      <span id="project-reorder-hint" className="sr-only">Reorder projects by dragging, or use Move up and Move down in the actions menu.</span>
      <AnimatePresence initial={false} mode="popLayout">
      {projects.map((project, index) => {
        const open = expandedProjectIds.has(project.id)
        const projectConversations = conversations.filter(
          (conversation) => conversation.project_id === project.id,
        )
        const panelId = `project-${project.id}-conversations`
        return (
          <SidebarMotionItem key={project.id} className="flex min-w-0 flex-col gap-0.5">
            <div
              data-drop-edge={drop?.id === project.id ? drop.edge : undefined}
              onDragOver={(event) => {
                if (event.dataTransfer.types.includes(projectDragType)) {
                  if (order.pending) return
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'move'
                  const edge = projectDropEdge(event)
                  setDrop((current) => current?.id === project.id && current.edge === edge ? current : { id: project.id, edge })
                  return
                }
                if (!event.dataTransfer.types.includes(conversationDragType)) return
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
                setDrop(null)
              }}
              onDrop={(event) => {
                delete event.currentTarget.dataset.dropTarget
                setDrop(null)
                if (event.dataTransfer.types.includes(projectDragType)) {
                  if (order.pending) return
                  event.preventDefault()
                  void order.reorder(event.dataTransfer.getData(projectDragType), project.id, projectDropEdge(event))
                  return
                }
                if (!event.dataTransfer.types.includes(conversationDragType)) return
                event.preventDefault()
                const conversationId = draggedConversationId(event)
                if (conversationId) void move(conversationId, project.id).catch(() => undefined)
              }}
              className={cn(
                'relative rounded-xl transition-[background-color,box-shadow] motion-reduce:transition-none data-[drop-target=true]:bg-primary/10 data-[drop-target=true]:ring-1 data-[drop-target=true]:ring-primary/40',
                'before:pointer-events-none before:absolute before:inset-x-2 before:h-0.5 before:rounded-full before:bg-primary before:opacity-0 data-[drop-edge=before]:before:top-0 data-[drop-edge=after]:before:bottom-0 data-[drop-edge]:before:opacity-100',
              )}
            >
              <ProjectRow
                project={project}
                open={open}
                onToggle={() => onProjectToggle(project.id)}
                onRename={onProjectRename}
                onDelete={onProjectDelete}
                reorderDisabled={order.pending || projects.length < 2}
                onMoveUp={index > 0 ? () => void order.reorder(project.id, projects[index - 1].id, 'before') : undefined}
                onMoveDown={index < projects.length - 1 ? () => void order.reorder(project.id, projects[index + 1].id, 'after') : undefined}
              />
              <CollapsiblePanel open={open} transition={reduce ? { duration: 0 } : SIDEBAR_FADE_TRANSITION}>
                <ul id={panelId} className="relative flex min-w-0 flex-col gap-0.5">
                <AnimatePresence initial={false} mode="popLayout">
                {projectConversations.map((conversation) => (
                  <SidebarMotionListItem key={conversation.id}>
                    <ConversationRow
                      responsePending={pendingConversationIds.includes(conversation.id)}
                      conversation={conversation}
                      pinPending={pinPending}
                      onPin={onConversationPin}
                      projects={projects}
                      active={conversation.id === activeConversationId}
                      nested
                      onSelect={onConversationSelect}
                      onRename={onConversationRename}
                      onDelete={onConversationDelete}
                      onMoveToProject={move}
                    />
                  </SidebarMotionListItem>
                ))}
                {!projectConversations.length ? (
                  <SidebarMotionListItem key="empty">
                    <p className="ms-6 px-2.5 py-2 text-xs text-muted-foreground">
                      Move conversations here
                    </p>
                  </SidebarMotionListItem>
                ) : null}
              </AnimatePresence>
                </ul>
              </CollapsiblePanel>
              {moveError[project.id] ? (
                <p role="alert" className="px-2.5 py-1 text-xs text-destructive">
                  {moveError[project.id]}
                </p>
              ) : null}
            </div>
          </SidebarMotionItem>
        )
      })}
      {!projects.length ? (
        <SidebarMotionItem key="empty-projects">
          <p className="px-2.5 py-2 text-xs text-muted-foreground">No projects yet</p>
        </SidebarMotionItem>
      ) : null}
      </AnimatePresence>
      <span role="alert" className={order.error ? 'px-2.5 py-1 text-xs text-destructive' : 'sr-only'}>{order.error}</span>
    </div>
  )
}
