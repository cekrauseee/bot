import { AnimatePresence } from 'motion/react'
import { useState, type DragEvent } from 'react'

import type { ConversationSummary, ProjectSummary } from '../../model'
import { ConversationRow, pinnedConversationDragType } from './conversation-row'
import { SidebarMotionItem } from './sidebar-motion'

type Props = {
  conversations: ConversationSummary[]
  projects: ProjectSummary[]
  activeConversationId?: string
  pendingConversationIds: readonly string[]
  pinPending: boolean
  onSelect: (conversation: ConversationSummary) => void
  onRename: (id: string, title: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onMoveToProject: (id: string, projectId: string | null) => Promise<void>
  onPin: (id: string, pinned: boolean) => Promise<void>
  onReorder: (id: string, targetId: string, edge: 'before' | 'after') => void
}

const dropEdge = (event: DragEvent<HTMLElement>) => {
  const bounds = event.currentTarget.getBoundingClientRect()
  return event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after'
}

export function PinnedConversationList({ conversations, onReorder, ...rowProps }: Props) {
  const [drop, setDrop] = useState<{ id: string; edge: 'before' | 'after' } | null>(null)
  return (
    <div className="relative flex flex-col gap-0.5 px-1" onDragEnd={() => setDrop(null)}>
      <AnimatePresence initial={false} mode="popLayout">
        {conversations.map((conversation, index) => (
          <SidebarMotionItem key={conversation.id}>
            <div
              data-pinned-conversation={conversation.id}
              data-drop-edge={drop?.id === conversation.id ? drop.edge : undefined}
              className="relative rounded-xl before:pointer-events-none before:absolute before:inset-x-2 before:h-0.5 before:rounded-full before:bg-primary before:opacity-0 data-[drop-edge=before]:before:top-0 data-[drop-edge=after]:before:bottom-0 data-[drop-edge]:before:opacity-100"
              onDragOver={(event) => {
                if (rowProps.pinPending || !event.dataTransfer.types.includes(pinnedConversationDragType)) return
                event.preventDefault()
                event.dataTransfer.dropEffect = 'move'
                setDrop({ id: conversation.id, edge: dropEdge(event) })
              }}
              onDragLeave={(event) => {
                if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return
                setDrop(null)
              }}
              onDrop={(event) => {
                setDrop(null)
                if (rowProps.pinPending || !event.dataTransfer.types.includes(pinnedConversationDragType)) return
                event.preventDefault()
                const id = event.dataTransfer.getData(pinnedConversationDragType)
                onReorder(id, conversation.id, dropEdge(event))
              }}
            >
              <ConversationRow
                {...rowProps}
                conversation={conversation}
                active={conversation.id === rowProps.activeConversationId}
                responsePending={rowProps.pendingConversationIds.includes(conversation.id)}
                onMoveUp={index > 0 ? () => onReorder(conversation.id, conversations[index - 1].id, 'before') : undefined}
                onMoveDown={index < conversations.length - 1 ? () => onReorder(conversation.id, conversations[index + 1].id, 'after') : undefined}
              />
            </div>
          </SidebarMotionItem>
        ))}
      </AnimatePresence>
    </div>
  )
}
