import { useEffect } from "react"
import { Navigate } from "react-router-dom"

import { useAppShell } from "@/features/app-shell/app-shell-context"
import { Spinner } from "@/components/ui/spinner"
import { ConversationView } from "@/features/conversation/components/conversation-view"

export default function ConversationPage() {
  const {
    activeConversation,
    activeConversationRecord,
    catalogFailed,
    catalogLoading,
    loadConversation,
  } = useAppShell()

  useEffect(() => {
    if (activeConversation) void loadConversation(activeConversation.id)
  }, [activeConversation, loadConversation])

  if (catalogLoading && !activeConversation) {
    return (
      <div className="flex size-full items-center justify-center">
        <Spinner aria-label="Loading conversation" />
      </div>
    )
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
    return (
      <div className="flex size-full items-center justify-center">
        <Spinner aria-label="Loading conversation messages" />
      </div>
    )
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

  return <ConversationView messages={activeConversationRecord.messages} />
}
