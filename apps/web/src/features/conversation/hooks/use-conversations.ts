import { useCallback, useEffect, useRef, useState } from "react"

import { conversationApi } from "@/features/conversation/api"
import {
  applyTurnEvent,
  applyBrowserFrame,
  consumeTurnSpacerAnchor,
  emptyConversationRecord,
  markRunStopRequested,
  mergeConversationSnapshot,
  recordFromDetail,
  type ConversationRecord,
} from "@/features/conversation/conversation-state"
import type { TurnStreamEvent } from "@/features/composer/api"
import { apiErrorMessage } from "@/lib/api"
import {
  parseActiveRun,
  subscribeToRun,
} from "@/features/conversation/run-subscription"
import { parseConversationSummary } from "@/features/app-shell/conversation-metadata"
import type { ConversationSummary } from "@/features/app-shell/api"

const idleRecord = emptyConversationRecord()

export function useConversations(
  activeConversationId: string | null,
  options?: {
    onConversationTitle?: (conversation: ConversationSummary) => void
  }
) {
  const [records, setRecords] = useState<Record<string, ConversationRecord>>({})
  const recordsRef = useRef(records)
  const requests = useRef(new Map<string, AbortController>())
  const subscriptions = useRef(new Map<string, { runId: string; stop: () => void }>())
  recordsRef.current = records

  useEffect(
    () => () => {
      for (const controller of requests.current.values()) controller.abort()
      requests.current.clear()
      for (const { stop } of subscriptions.current.values()) stop()
      subscriptions.current.clear()
    },
    []
  )

  const loadConversation = useCallback(
    async (conversationId: string, options?: { force?: boolean }) => {
      const current = recordsRef.current[conversationId]
      if (
        !options?.force &&
        (current?.status === "loading" || current?.status === "ready")
      ) {
        return
      }

      requests.current.get(conversationId)?.abort()
      const controller = new AbortController()
      requests.current.set(conversationId, controller)
      const expectedVersion = current?.version ?? 0

      setRecords((state) => {
        const record = state[conversationId] ?? emptyConversationRecord()
        return {
          ...state,
          [conversationId]: {
            ...record,
            error: "",
            status: record.messages.length ? "ready" : "loading",
          },
        }
      })

      try {
        const detail = await conversationApi.detail(
          conversationId,
          controller.signal
        )
        if (controller.signal.aborted) return
        setRecords((state) => {
          const latest = state[conversationId] ?? emptyConversationRecord()
          if (!options?.force && latest.version !== expectedVersion)
            return state
          const incomingCursor = detail.event_cursor ??
            (parseActiveRun(detail.active_run)?.last_event_sequence ?? "0")
          const incoming = recordFromDetail(
            detail.messages,
            parseActiveRun(detail.active_run) ?? undefined,
            incomingCursor
          )
          const merged = mergeConversationSnapshot(
            latest,
            incoming,
            incomingCursor
          )
          return merged === latest
            ? state
            : { ...state, [conversationId]: merged }
        })
      } catch (error) {
        if (controller.signal.aborted) return
        setRecords((state) => {
          const latest = state[conversationId] ?? emptyConversationRecord()
          if (!options?.force && latest.version !== expectedVersion)
            return state
          return {
            ...state,
            [conversationId]: {
              ...latest,
              error: apiErrorMessage(
                error,
                "Unable to load this conversation. Try again."
              ),
              status: "error",
            },
          }
        })
      } finally {
        if (requests.current.get(conversationId) === controller) {
          requests.current.delete(conversationId)
        }
      }
    },
    []
  )

  const applyEvent = useCallback(
    (conversationId: string, event: TurnStreamEvent, at = Date.now()) => {
      setRecords((state) => {
        const current = state[conversationId] ?? emptyConversationRecord()
        return {
          ...state,
          [conversationId]: applyTurnEvent(current, event, at),
        }
      })
    },
    []
  )

  const onConversationTitle = options?.onConversationTitle
  useEffect(() => {
    for (const [conversationId, record] of Object.entries(records)) {
      if (!record.runId) continue
      const existing = subscriptions.current.get(conversationId)
      if (existing?.runId === record.runId) continue
      if (existing) {
        existing.stop()
        subscriptions.current.delete(conversationId)
      }
      if (!record.runId) continue
      const stop = subscribeToRun({
        after: record.lastEventSequence ?? "0",
        runId: record.runId,
        turnId: record.turnId,
        onEvent: (event) => {
          applyEvent(conversationId, event)
          if (event.type === "conversation.title.updated") {
            const conversation = parseConversationSummary(
              event.data.conversation
            )
            if (conversation) onConversationTitle?.(conversation)
          }
        },
        onFrame: (frame, frameRunId) => {
          setRecords((state) => {
            const current = state[conversationId] ?? emptyConversationRecord()
            const next = applyBrowserFrame(current, frame, frameRunId)
            return next === current
              ? state
              : { ...state, [conversationId]: next }
          })
        },
        onTerminal: () => {
          if (subscriptions.current.get(conversationId)?.runId === record.runId) {
            subscriptions.current.delete(conversationId)
          }
          void loadConversation(conversationId, { force: true })
        },
        onResync: () => {
          if (subscriptions.current.get(conversationId)?.runId === record.runId) {
            subscriptions.current.delete(conversationId)
          }
          void loadConversation(conversationId, { force: true })
        },
      })
      subscriptions.current.set(conversationId, { runId: record.runId, stop })
    }
    for (const [conversationId, subscription] of subscriptions.current) {
      if (!records[conversationId]?.runId) {
        subscription.stop()
        subscriptions.current.delete(conversationId)
      }
    }
  }, [applyEvent, loadConversation, onConversationTitle, records])

  const consumeSpacerAnchor = useCallback(
    (conversationId: string, anchorId: string) => {
      setRecords((state) => {
        const current = state[conversationId]
        if (!current) return state
        const next = consumeTurnSpacerAnchor(current, anchorId)
        if (next === current) return state
        return { ...state, [conversationId]: next }
      })
    },
    []
  )

  const setRunStopRequested = useCallback(
    (conversationId: string, runId: string, requested: boolean) => {
      setRecords((state) => {
        const current = state[conversationId]
        if (!current) return state
        const next = markRunStopRequested(current, runId, requested)
        return next === current ? state : { ...state, [conversationId]: next }
      })
    },
    []
  )

  return {
    activeRecord: activeConversationId
      ? (records[activeConversationId] ?? idleRecord)
      : null,
    activeTurnConversationId:
      Object.entries(records).find(
        ([, record]) => record.activeAssistantId !== undefined
      )?.[0] ?? null,
    applyEvent,
    consumeTurnSpacerAnchor: consumeSpacerAnchor,
    loadConversation,
    setRunStopRequested,
  }
}
