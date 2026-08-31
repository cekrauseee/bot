import { useCallback, useEffect, useLayoutEffect, useReducer, useRef } from 'react'

import type { ProjectSummary } from '../model'
import { createNewConversationGate } from './new-conversation-gate'
import {
  createConversationProject,
  renameConversationProject,
  renameConversation,
  reorderConversationProjects,
  deleteConversationProject,
  deleteConversation,
  loadConversationCatalog,
  loadConversationDetail,
  moveConversationToProject,
  setConversationPinned,
  reorderPinnedConversations,
  readEventStream,
  startConversationTurn,
  ConversationApiError,
  type ModelName,
  type ReasoningEffort,
  type Speed,
} from '../services/conversation-api'
import {
  conversationControllerReducer,
  conversationRouteIdentity,
  conversationRouteKey,
  createOptimisticMessages,
  detailFailureStatus,
  initialConversationControllerState,
  sameConversationRoute,
  selectActiveConversation,
  shouldLoadConversationDetail,
  type ConversationRouteIdentity,
} from '../state/conversation-controller'
import {
  findTurnOperation,
  releaseTurnOperation,
  rekeyTurnOperation,
  type TurnOperation,
} from './turn-operation-registry'

type KeyedController = {
  operationId: string
  controller: AbortController
}

type NewConversationHandoff = {
  from: 'new'
  to: string
  operationId: string
}

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback

export function useConversationController(
  conversationId: string | undefined,
  onConversationStarted?: (id: string) => void,
) {
  const [state, dispatch] = useReducer(
    conversationControllerReducer,
    undefined,
    initialConversationControllerState,
  )
  const activeIdentity = conversationRouteIdentity(conversationId)
  const activeKey = conversationRouteKey(activeIdentity)
  const activeConversation = selectActiveConversation(state, activeIdentity)

  const stateRef = useRef(state)
  const onConversationStartedRef = useRef(onConversationStarted)
  const catalogControllerRef = useRef<KeyedController | null>(null)
  const detailControllersRef = useRef(new Map<string, KeyedController>())
  const turnControllersRef = useRef(new Map<string, TurnOperation>())
  const previousIdentityRef = useRef(activeIdentity)
  const handoffRef = useRef<NewConversationHandoff | null>(null)
  const mountedRef = useRef(true)
  const renderedConversationId = useRef(conversationId)

  useLayoutEffect(() => {
    renderedConversationId.current = conversationId
  }, [conversationId])

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    onConversationStartedRef.current = onConversationStarted
  }, [onConversationStarted])

  const reloadCatalog = useCallback(async (force = true) => {
    if (catalogControllerRef.current && !force) return
    if (force) catalogControllerRef.current?.controller.abort()
    const operationId = crypto.randomUUID()
    const controller = new AbortController()
    catalogControllerRef.current = { operationId, controller }
    const refreshing = stateRef.current.catalog.conversations.length > 0 ||
      stateRef.current.catalog.projects.length > 0
    dispatch({ type: 'catalog.load.started', operationId, refreshing })
    try {
      const catalog = await loadConversationCatalog(controller.signal)
      if (controller.signal.aborted) return
      dispatch({ type: 'catalog.load.succeeded', operationId, ...catalog })
    } catch (error) {
      dispatch(controller.signal.aborted
        ? { type: 'catalog.load.aborted', operationId }
        : {
            type: 'catalog.load.failed',
            operationId,
            error: errorMessage(error, 'Unable to load conversations.'),
          })
    } finally {
      if (catalogControllerRef.current?.operationId === operationId) {
        catalogControllerRef.current = null
      }
    }
  }, [])

  const ensureDetail = useCallback(async (id: string, force = false) => {
    const current = stateRef.current.conversationsById[id]
    if (!shouldLoadConversationDetail(current?.detail.status, force)) return
    const existing = detailControllersRef.current.get(id)
    if (existing && !force) return
    existing?.controller.abort()
    const operationId = crypto.randomUUID()
    const controller = new AbortController()
    detailControllersRef.current.set(id, { operationId, controller })
    dispatch({ type: 'detail.load.started', id, operationId })
    try {
      const detail = await loadConversationDetail(id, controller.signal)
      if (controller.signal.aborted) return
      dispatch({ type: 'detail.load.succeeded', id, operationId, detail })
    } catch (error) {
      dispatch(controller.signal.aborted
        ? { type: 'detail.load.aborted', id, operationId }
        : {
            type: 'detail.load.failed',
            id,
            operationId,
            status: detailFailureStatus(
              error instanceof ConversationApiError ? error.status : undefined,
            ),
            error: errorMessage(error, 'Unable to load the conversation.'),
          })
    } finally {
      if (detailControllersRef.current.get(id)?.operationId === operationId) {
        detailControllersRef.current.delete(id)
      }
    }
  }, [])

  const abortTurnOperation = useCallback((operationId: string) => {
    const operation = releaseTurnOperation(turnControllersRef.current, operationId)
    if (!operation) return
    operation.controller.abort()
    dispatch({
      type: 'turn.aborted',
      key: operation.identity,
      operationId,
      at: Date.now(),
    })
  }, [])

  const stop = useCallback((identity: ConversationRouteIdentity) => {
    const operation = findTurnOperation(turnControllersRef.current, identity)
    if (operation) {
      abortTurnOperation(operation.operationId)
      return
    }
    const handoff = handoffRef.current
    if (identity.kind === 'new' && handoff) abortTurnOperation(handoff.operationId)
  }, [abortTurnOperation])

  const send = useCallback(async (
    identity: ConversationRouteIdentity,
    message: string,
    model: ModelName,
    reasoningEffort: ReasoningEffort,
    speed: Speed,
    retryMessageId?: string,
    onAccepted?: () => void,
  ) => {
    const alreadyRunning = findTurnOperation(turnControllersRef.current, identity)
    if (alreadyRunning) return

    const operationId = crypto.randomUUID()
    const record = selectActiveConversation(stateRef.current, identity)
    const serverId = identity.kind === 'existing' ? identity.id : record.id
    const previous = record.messages.at(-1)
    const retryId = retryMessageId ?? (identity.kind === 'new' && previous?.status === 'error' &&
      record.lastTurnInput?.message === message ? previous.id : undefined)
    const input = {
      message, model, reasoning_effort: reasoningEffort, speed,
      ...(serverId && retryId && !retryId.startsWith('pending-') ? { retry_of: retryId } : {}),
    }
    const controller = new AbortController()
    let operationIdentity = identity
    turnControllersRef.current.set(operationId, {
      operationId,
      controller,
      identity: operationIdentity,
    })
    dispatch({
      type: 'turn.started',
      key: identity,
      operationId,
      input,
      retryMessageId: retryId,
      optimisticMessages: createOptimisticMessages(
        message,
        crypto.randomUUID(),
        Date.now(),
      ),
    })

    const acceptNewConversation = createNewConversationGate((id) => {
      onAccepted?.()
      dispatch({ type: 'turn.handoff', operationId, id })
      operationIdentity = { kind: 'existing', id }
      rekeyTurnOperation(turnControllersRef.current, operationId, operationIdentity)
      handoffRef.current = { from: 'new', to: id, operationId }
      onConversationStartedRef.current?.(id)
    }, () => controller.signal.aborted || !mountedRef.current || renderedConversationId.current !== undefined)
    if (identity.kind === 'existing') onAccepted?.()

    try {
      const response = await startConversationTurn(
        serverId,
        input,
        controller.signal,
      )
      await readEventStream(response, (event) => {
        // The terminal event follows persistence; Retry can start before the old
        // response body's final read resolves, without being silently rejected.
        if (event.type === 'turn.completed' || event.type === 'turn.failed') {
          releaseTurnOperation(turnControllersRef.current, operationId)
        }
        dispatch({
          type: 'turn.event',
          key: operationIdentity,
          operationId,
          event,
          at: Date.now(),
          deferHandoff: operationIdentity.kind === 'new',
        })
        if (operationIdentity.kind === 'new') acceptNewConversation(event)
      })
    } catch (error) {
      dispatch({
        type: 'turn.failed',
        key: operationIdentity,
        operationId,
        error: error instanceof TypeError
          ? 'Could not connect to the server. Check your connection and retry the response.'
          : errorMessage(error, 'Unable to complete the response. Try again.'),
        cancelled: controller.signal.aborted,
        retryable: !(error instanceof ConversationApiError) ||
          error.status >= 500 || error.status === 408 || error.status === 429,
        at: Date.now(),
      })
    } finally {
      turnControllersRef.current.delete(operationId)
    }
  }, [])

  const retryTurn = useCallback((identity: ConversationRouteIdentity) => {
    const record = selectActiveConversation(stateRef.current, identity)
    const last = record.messages.at(-1)
    const input = record.lastTurnInput
    if (last?.status !== 'error' || last.retryable === false || !input) return
    return send(identity, input.message, input.model, input.reasoning_effort, input.speed, last.id)
  }, [send])

  const retryActive = useCallback(() => {
    const identity = conversationRouteIdentity(conversationId)
    if (identity.kind === 'existing') {
      void ensureDetail(identity.id, true)
    } else {
      void reloadCatalog(true)
    }
  }, [conversationId, ensureDetail, reloadCatalog])

  const createProject = useCallback(async (name: string): Promise<ProjectSummary> => {
    const project = await createConversationProject(name)
    dispatch({ type: 'catalog.project.added', project })
    return project
  }, [])

  const renameProject = useCallback(async (id: string, name: string) => {
    const project = await renameConversationProject(id, name)
    dispatch({ type: 'catalog.project.renamed', project })
  }, [])

  const reorderProjects = useCallback(async (ids: string[]) => {
    try {
      const result = await reorderConversationProjects(ids)
      dispatch({ type: 'catalog.projects.reordered', projects: result.projects })
    } catch (error) {
      if (error instanceof ConversationApiError && error.status === 409) void reloadCatalog()
      throw error
    }
  }, [reloadCatalog])

  const rename = useCallback(async (id: string, title: string) => {
    const conversation = await renameConversation(id, title)
    dispatch({ type: 'catalog.conversation.renamed', conversation })
  }, [])

  const removeProject = useCallback(async (id: string) => {
    await deleteConversationProject(id)
    dispatch({ type: 'catalog.project.removed', id })
  }, [])

  const moveToProject = useCallback(async (id: string, projectId: string | null) => {
    const conversation = await moveConversationToProject(id, projectId)
    dispatch({ type: 'catalog.conversation.upserted', conversation })
  }, [])

  const pin = useCallback(async (id: string, pinned: boolean) => {
    const conversation = await setConversationPinned(id, pinned)
    dispatch({ type: 'catalog.pins.updated', conversations: [conversation] })
  }, [])

  const reorderPins = useCallback(async (ids: string[]) => {
    const result = await reorderPinnedConversations(ids)
    dispatch({ type: 'catalog.pins.updated', conversations: result.conversations })
  }, [])

  const remove = useCallback(async (id: string) => {
    await deleteConversation(id)
    dispatch({ type: 'catalog.conversation.removed', id })
  }, [])

  useEffect(() => {
    if (state.catalog.status === 'idle') void reloadCatalog(false)
  }, [reloadCatalog, state.catalog.status])

  useEffect(() => {
    const previous = previousIdentityRef.current
    if (sameConversationRoute(previous, activeIdentity)) return
    const handoff = handoffRef.current
    if (
      previous.kind === 'new' &&
      activeIdentity.kind === 'existing' &&
      handoff?.to === activeIdentity.id
    ) {
      handoffRef.current = null
    } else {
      if (previous.kind === 'new' && handoff) {
        abortTurnOperation(handoff.operationId)
        handoffRef.current = null
      } else {
        stop(previous)
      }
    }
    previousIdentityRef.current = activeIdentity
  }, [abortTurnOperation, activeKey, activeIdentity, stop])

  useEffect(() => {
    if (activeIdentity.kind !== 'existing') return
    const record = state.conversationsById[activeIdentity.id]
    if (!record || record.detail.status === 'idle') {
      void ensureDetail(activeIdentity.id)
    }
  }, [activeKey, activeIdentity, ensureDetail, state.conversationsById])

  useEffect(() => {
    const detailControllers = detailControllersRef.current
    const turnControllers = turnControllersRef.current
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      queueMicrotask(() => {
        if (mountedRef.current) return
        catalogControllerRef.current?.controller.abort()
        for (const operation of detailControllers.values()) {
          operation.controller.abort()
        }
        for (const operation of turnControllers.values()) {
          operation.controller.abort()
        }
      })
    }
  }, [])

  return {
    state,
    catalog: state.catalog,
    activeIdentity,
    activeConversation,
    retryActive,
    retryTurn,
    reloadCatalog,
    send,
    stop,
    remove,
    createProject,
    renameProject,
    reorderProjects,
    rename,
    removeProject,
    moveToProject,
    pin,
    reorderPins,
    isDeleted: (id: string) => state.catalog.deletedConversationIds.includes(id),
  }
}
