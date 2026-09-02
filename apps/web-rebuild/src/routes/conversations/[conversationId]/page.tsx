import { useCallback, useEffect } from "react"
import { Navigate } from "react-router-dom"

import { useAppShell } from "@/features/app-shell/app-shell-context"
import { ConversationSkeleton } from "@/features/conversation/components/conversation-skeleton"
import { ConversationView } from "@/features/conversation/components/conversation-view"

export default function ConversationPage() {
  const {
    activeConversation,
    activeConversationRecord,
    catalogFailed,
    catalogLoading,
    consumeTurnSpacerAnchor,
    loadConversation,
  } = useAppShell()
  useEffect(() => {
    if (activeConversation) void loadConversation(activeConversation.id)
  }, [activeConversation, loadConversation])

  const activeConversationId = activeConversation?.id
  const handleTurnSpacerAnchorConsumed = useCallback(
    (anchorId: string) => {
      if (activeConversationId) {
        consumeTurnSpacerAnchor(activeConversationId, anchorId)
      }
    },
    [activeConversationId, consumeTurnSpacerAnchor]
  )

  if (catalogLoading && !activeConversation) {
    return <ConversationSkeleton />
  }

  if (!activeConversation && !catalogFailed) {
    return <Navigate to="/" replace />
  }

  if (
    !activeConversationRecord ||
    ((activeConversationRecord.status === "idle" ||
      activeConversationRecord.status === "loading") &&
      !activeConversationRecord.messages.length)
  ) {
    return <ConversationSkeleton />
  }

  if (activeConversationRecord.status === "error") {
    return (
      <div className="flex size-full items-center justify-center p-6">
        <p role="alert" className="text-sm text-muted-foreground">
          {activeConversationRecord.error}
        </p>
      </div>
    )
  }

  if (!activeConversation) {
    return <Navigate to="/" replace />
  }

  return (
    <ConversationView
      key={activeConversation.id}
      messages={activeConversationRecord.messages}
      onTurnSpacerAnchorConsumed={handleTurnSpacerAnchorConsumed}
      turnSpacerAnchorId={activeConversationRecord.turnSpacerAnchorId}
    />
  )
}
