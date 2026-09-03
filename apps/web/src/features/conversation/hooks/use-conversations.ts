import { useCallback, useEffect, useRef, useState } from "react"

import { conversationApi } from "@/features/conversation/api"
import {
  applyTurnEvent,
  consumeTurnSpacerAnchor,
  emptyConversationRecord,
  recordFromDetail,
  type ConversationRecord,
} from "@/features/conversation/conversation-state"
import type { TurnStreamEvent } from "@/features/composer/api"
import { apiErrorMessage } from "@/lib/api"

const idleRecord = emptyConversationRecord()

export function useConversations(activeConversationId: string | null) {
  const [records, setRecords] = useState<Record<string, ConversationRecord>>({})
  const recordsRef = useRef(records)
  const requests = useRef(new Map<string, AbortController>())
  recordsRef.current = records

  useEffect(
    () => () => {
      for (const controller of requests.current.values()) controller.abort()
      requests.current.clear()
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
          if (latest.version !== expectedVersion) return state
          return {
            ...state,
            [conversationId]: {
              ...recordFromDetail(detail.messages),
              version: latest.version,
            },
          }
        })
      } catch (error) {
        if (controller.signal.aborted) return
        setRecords((state) => {
          const latest = state[conversationId] ?? emptyConversationRecord()
          if (latest.version !== expectedVersion) return state
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
  }
}
