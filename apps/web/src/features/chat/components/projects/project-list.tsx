import { Folder, FolderOpen } from 'lucide-react'
import { useState, type DragEvent } from 'react'

import type { ConversationSummary, ProjectSummary } from '@/features/chat/model'
import { cn } from '@/lib/utils'
import {
  ConversationRow,
  conversationDragType,
} from '../sidebar/conversation-row'

type ProjectListProps = {
  projects: ProjectSummary[]
  conversations: ConversationSummary[]
  activeConversationId?: string
  onConversationSelect: (conversation: ConversationSummary) => void
  onConversationDelete: (id: string) => Promise<void>
  onMoveToProject: (conversationId: string, projectId: string | null) => Promise<void>
}

export function ProjectList({
  projects,
  conversations,
  activeConversationId,
  onConversationSelect,
  onConversationDelete,
  onMoveToProject,
}: ProjectListProps) {
  const [expanded, setExpanded] = useState(() => {
    const active = conversations.find((conversation) =>
      conversation.id === activeConversationId)
    return new Set(active?.project_id ? [active.project_id] : [])
  })
  const [moveError, setMoveError] = useState<Record<string, string>>({})

  const move = async (conversationId: string, projectId: string | null) => {
    const conversation = conversations.find((item) => item.id === conversationId)
    if (!conversation || conversation.project_id === projectId) return
    if (projectId === null) return onMoveToProject(conversationId, null)
    setMoveError((current) => ({ ...current, [projectId]: '' }))
    try {
      await onMoveToProject(conversationId, projectId)
      setExpanded((current) => new Set(current).add(projectId))
    } catch {
      setMoveError((current) => ({
        ...current,
        [projectId]: 'Unable to move the conversation. Try again.',
      }))
      throw new Error('Unable to move the conversation.')
    }
  }

  const draggedConversationId = (event: DragEvent<HTMLElement>) =>
    event.dataTransfer.getData(conversationDragType) ||
    event.dataTransfer.getData('text/plain')

  return (
    <div className="flex flex-col gap-0.5 px-1">
      {projects.map((project) => {
        const open = expanded.has(project.id)
        const projectConversations = conversations.filter((conversation) =>
          conversation.project_id === project.id)
        const panelId = `project-${project.id}-conversations`
        return (
          <div key={project.id} className="flex min-w-0 flex-col gap-0.5">
            <button
              type="button"
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => setExpanded((current) => {
                const next = new Set(current)
                if (next.has(project.id)) next.delete(project.id)
                else next.add(project.id)
                return next
              })}
              onDragOver={(event) => {
                if (!event.dataTransfer.types.includes(conversationDragType)) return
                event.preventDefault()
                event.dataTransfer.dropEffect = 'move'
                event.currentTarget.dataset.dropTarget = 'true'
              }}
              onDragLeave={(event) => {
                if (event.relatedTarget instanceof Node &&
                    event.currentTarget.contains(event.relatedTarget)) return
                delete event.currentTarget.dataset.dropTarget
              }}
              onDrop={(event) => {
                event.preventDefault()
                delete event.currentTarget.dataset.dropTarget
                const conversationId = draggedConversationId(event)
                if (conversationId) void move(conversationId, project.id).catch(() => undefined)
              }}
              className={cn(
                'flex min-h-9 w-full min-w-0 items-center gap-2 rounded-xl px-2.5 text-xs text-muted-foreground outline-none transition-[background-color,color,box-shadow] hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[drop-target=true]:bg-primary/10 data-[drop-target=true]:text-foreground data-[drop-target=true]:ring-1 data-[drop-target=true]:ring-primary/40 motion-reduce:transition-none',
              )}
            >
              {open ? (
                <FolderOpen aria-hidden="true" className="size-4 shrink-0" />
              ) : (
                <Folder aria-hidden="true" className="size-4 shrink-0" />
              )}
              <span className="min-w-0 flex-1 truncate text-start">{project.name}</span>
            </button>
            {open ? (
              <div id={panelId} className="flex flex-col gap-0.5">
                {projectConversations.map((conversation) => (
                  <ConversationRow
                    key={conversation.id}
                    conversation={conversation}
                    projects={projects}
                    active={conversation.id === activeConversationId}
                    nested
                    onSelect={onConversationSelect}
                    onDelete={onConversationDelete}
                    onMoveToProject={move}
                  />
                ))}
                {!projectConversations.length ? (
                  <p className="ms-6 px-2.5 py-2 text-xs text-muted-foreground">
                    Move conversations here
                  </p>
                ) : null}
              </div>
            ) : null}
            {moveError[project.id] ? (
              <p role="alert" className="px-2.5 py-1 text-xs text-destructive">
                {moveError[project.id]}
              </p>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
