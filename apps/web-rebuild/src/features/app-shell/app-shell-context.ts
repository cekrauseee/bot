import { createContext, useContext } from "react"

import type { ConversationSummary } from "@/features/app-shell/api"
import type { ConversationRecord } from "@/features/conversation/conversation-state"

export type AppShellContextValue = {
  activeConversation: ConversationSummary | null
  activeConversationRecord: ConversationRecord | null
  catalogFailed: boolean
  catalogLoading: boolean
  loadConversation: (conversationId: string) => Promise<void>
}

export const AppShellContext = createContext<AppShellContextValue | null>(null)

export function useAppShell() {
  const context = useContext(AppShellContext)

  if (!context) {
    throw new Error("useAppShell must be used within AuthenticatedAppShell")
  }

  return context
}
