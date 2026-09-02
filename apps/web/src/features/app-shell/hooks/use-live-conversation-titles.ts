import { useCallback, useEffect, useRef } from "react"

import type {
  ActiveTitleRun,
  ConversationSummary,
} from "@/features/app-shell/api"
import { subscribeToConversationTitle } from "@/features/app-shell/live-conversation-title"

type SubscribeTitleRunInput = {
  after: string
  conversationId: string
  runId: string
}

type UseLiveConversationTitlesOptions = {
  activeRuns: ActiveTitleRun[]
  conversations: ConversationSummary[]
  onConversationTitle: (conversation: ConversationSummary) => void
  onResync: () => void
}

export function useLiveConversationTitles({
  activeRuns,
  conversations,
  onConversationTitle,
  onResync,
}: UseLiveConversationTitlesOptions) {
  const subscriptions = useRef(new Map<string, () => void>())
  const settledRuns = useRef(new Set<string>())

  const subscribeTitleRun = useCallback(
    ({ after, conversationId, runId }: SubscribeTitleRunInput) => {
      if (subscriptions.current.has(runId) || settledRuns.current.has(runId)) {
        return
      }

      let stopSubscription: () => void = () => undefined
      stopSubscription = subscribeToConversationTitle({
        after,
        conversationId,
        onClosed: () => {
          if (subscriptions.current.get(runId) === stopSubscription) {
            subscriptions.current.delete(runId)
          }
          settledRuns.current.add(runId)
        },
        onConversationTitle,
        onResync,
        runId,
      })
      subscriptions.current.set(runId, stopSubscription)
    },
    [onConversationTitle, onResync]
  )

  useEffect(() => {
    const activeRunIds = new Set(activeRuns.map((run) => run.id))
    for (const runId of settledRuns.current) {
      if (!activeRunIds.has(runId)) settledRuns.current.delete(runId)
    }

    const conversationsById = new Map(
      conversations.map((conversation) => [conversation.id, conversation])
    )
    for (const run of activeRuns) {
      const conversation = conversationsById.get(run.conversation_id)
      if (!conversation || conversation.title_updated_at) continue
      subscribeTitleRun({
        after: "0",
        conversationId: conversation.id,
        runId: run.id,
      })
    }
  }, [activeRuns, conversations, subscribeTitleRun])

  useEffect(
    () => () => {
      for (const stop of [...subscriptions.current.values()]) stop()
      subscriptions.current.clear()
      settledRuns.current.clear()
    },
    []
  )

  return subscribeTitleRun
}
