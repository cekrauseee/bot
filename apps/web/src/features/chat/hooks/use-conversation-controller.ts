import { useCallback, useEffect, useLayoutEffect, useReducer, useRef } from 'react'

import type {
  ChatQuestionAnswers,
  ChatQuestionRequest,
  ProjectSummary,
} from '../model'
import { createNewConversationGate, shouldNavigateInitialHandoff } from './new-conversation-gate'
import {
  createConversationProject,
  cancelAgentRun,
  renameConversationProject,
  renameConversation,
  reorderConversationProjects,
  deleteConversationProject,
  deleteConversation,
  loadConversationCatalog,
  loadConversationDetail,
  mapBrowserFrame,
  moveConversationToProject,
  parseActiveRunProjection,
  parseEventSequence,
  parseSocketMessage,
  setConversationPinned,
  reorderPinnedConversations,
  readEventStream,
  resumeAgentRun,
  startConversationTurn,
  agentRunSocketUrl,
  answerForQuestion,
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

type RunSubscription = {
  identity: ConversationRouteIdentity
  cursor: bigint
  socket: WebSocket | null
  reconnectAttempt: number
  reconnectTimer?: number
  stopped: boolean
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
  const runSubscriptionsRef = useRef(new Map<string, RunSubscription>())
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

  const closeRunSocket = useCallback((runId: string, reason = 'Run no longer active') => {
    const subscription = runSubscriptionsRef.current.get(runId)
    if (!subscription) return
    subscription.stopped = true
    if (subscription.reconnectTimer !== undefined) {
      window.clearTimeout(subscription.reconnectTimer)
      subscription.reconnectTimer = undefined
    }
    runSubscriptionsRef.current.delete(runId)
    const socket = subscription.socket
    subscription.socket = null
    if (socket && socket.readyState < 2) socket.close(1000, reason)
  }, [])

  const closeAllRunSockets = useCallback(() => {
    for (const runId of [...runSubscriptionsRef.current.keys()]) closeRunSocket(runId, 'Unmounted')
  }, [closeRunSocket])

  const connectRun = useCallback((
    identity: ConversationRouteIdentity,
    runId: string,
    after = '0',
  ) => {
    const afterSequence = parseEventSequence(after)
    const current = runSubscriptionsRef.current.get(runId)
    if (current) {
      current.identity = identity
      if (afterSequence > current.cursor) current.cursor = afterSequence
      if ((current.socket && current.socket.readyState < 2) || current.reconnectTimer !== undefined) return
    }
    const subscription = current ?? {
      identity,
      cursor: afterSequence,
      socket: null,
      reconnectAttempt: 0,
      stopped: false,
    }
    subscription.stopped = false
    runSubscriptionsRef.current.set(runId, subscription)

    const open = () => {
      if (subscription.stopped || runSubscriptionsRef.current.get(runId) !== subscription) return
      subscription.reconnectTimer = undefined
      const socket = new WebSocket(agentRunSocketUrl(
        runId,
        subscription.cursor.toString(),
        window.location.origin,
      ))
      subscription.socket = socket
      socket.onmessage = (message) => {
        if (subscription.stopped || runSubscriptionsRef.current.get(runId) !== subscription) return
        try {
          const parsed = parseSocketMessage(message.data)
          if (parsed.run_id !== runId) throw new Error('The response stream was invalid. Try again.')
          subscription.reconnectAttempt = 0
          if (parsed.type === 'browser.frame') {
            const frame = mapBrowserFrame(parsed.data)
            if (frame) dispatch({ type: 'run.browser-frame', key: subscription.identity, runId, frame })
            return
          }
          const sequence = parseEventSequence(parsed.sequence)
          if (sequence <= subscription.cursor) return
          subscription.cursor = sequence
          dispatch({ type: 'run.event', key: subscription.identity, event: parsed, at: Date.now() })
          if (parsed.type === 'turn.completed' ||
            parsed.type === 'turn.failed') {
            closeRunSocket(runId, 'Run completed')
          }
        } catch {
          dispatch({
            type: 'run.connection.failed',
            key: subscription.identity,
            runId,
            error: 'The live run connection returned an invalid event.',
          })
          closeRunSocket(runId, 'Invalid event')
        }
      }
      socket.onerror = () => socket.close()
      socket.onclose = () => {
        if (subscription.socket === socket) subscription.socket = null
        if (subscription.stopped || runSubscriptionsRef.current.get(runId) !== subscription) return
        const delay = Math.min(1_000 * (2 ** subscription.reconnectAttempt), 10_000)
        subscription.reconnectAttempt += 1
        subscription.reconnectTimer = window.setTimeout(open, delay)
      }
    }

    open()
  }, [closeRunSocket])

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
      const run = parseActiveRunProjection(detail.active_run)
      if (run) {
        const after = run.last_event_sequence ?? '0'
        const tracked = runSubscriptionsRef.current.get(run.id)
        if (tracked && tracked.cursor > parseEventSequence(after)) {
          // The background subscription advanced while the detail snapshot was loading.
          // Replaying from the snapshot cursor rebuilds any process events that could not
          // be projected before the assistant message was hydrated.
          closeRunSocket(run.id, 'Refreshing conversation snapshot')
        }
        connectRun(
          { kind: 'existing', id },
          run.id,
          after,
        )
      }
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
  }, [closeRunSocket, connectRun])

  const abortTurnOperation = useCallback((operationId: string, detached = false) => {
    const operation = releaseTurnOperation(turnControllersRef.current, operationId)
    if (!operation) return
    operation.controller.abort()
    dispatch(detached
      ? { type: 'turn.detached', key: operation.identity, operationId }
      : {
          type: 'turn.aborted',
          key: operation.identity,
          operationId,
          at: Date.now(),
        })
  }, [])

  const stop = useCallback((identity: ConversationRouteIdentity) => {
    const record = selectActiveConversation(stateRef.current, identity)
    if (record.activeRunId) {
      const runId = record.activeRunId
      dispatch({ type: 'run.cancelling', key: identity, runId })
      void cancelAgentRun(runId)
        .then(() => connectRun(identity, runId, record.lastSequence ?? '0'))
        .catch((error) => dispatch({
          type: 'run.connection.failed',
          key: identity,
          runId,
          error: errorMessage(error, 'Unable to stop the run.'),
        }))
      return
    }
    const operation = findTurnOperation(turnControllersRef.current, identity)
    if (operation) {
      abortTurnOperation(operation.operationId)
      return
    }
    const handoff = handoffRef.current
    if (identity.kind === 'new' && handoff) abortTurnOperation(handoff.operationId)
  }, [abortTurnOperation, connectRun])

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

    let activeRun: { id: string; after: string } | undefined
    const acceptNewConversation = createNewConversationGate((id) => {
      const initiatingRouteIsCurrent = shouldNavigateInitialHandoff(
        renderedConversationId.current,
        mountedRef.current,
      )
      if (initiatingRouteIsCurrent) onAccepted?.()
      dispatch({ type: 'turn.handoff', operationId, id })
      operationIdentity = { kind: 'existing', id }
      rekeyTurnOperation(turnControllersRef.current, operationId, operationIdentity)
      handoffRef.current = { from: 'new', to: id, operationId }
      if (initiatingRouteIsCurrent) onConversationStartedRef.current?.(id)
      if (activeRun) connectRun(operationIdentity, activeRun.id, activeRun.after)
    })
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
        if (event.type === 'turn.completed' ||
          event.type === 'turn.failed' ||
          event.type === 'user.input_required') {
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
        if (event.type === 'turn.started' && 'conversation' in event.data) {
          activeRun = { id: event.run_id, after: event.sequence }
          if (operationIdentity.kind === 'existing') {
            connectRun(operationIdentity, event.run_id, event.sequence)
          }
        }
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
  }, [connectRun])

  const retryTurn = useCallback((identity: ConversationRouteIdentity) => {
    const record = selectActiveConversation(stateRef.current, identity)
    const last = record.messages.at(-1)
    const input = record.lastTurnInput
    if (last?.status !== 'error' || last.retryable === false || !input) return
    return send(identity, input.message, input.model, input.reasoning_effort, input.speed, last.id)
  }, [send])

  const answerQuestion = useCallback(async (
    identity: ConversationRouteIdentity,
    question: ChatQuestionRequest,
    answers: ChatQuestionAnswers,
  ) => {
    const response = answerForQuestion(question, answers)
    if (!response) return
    dispatch({
      type: 'question.status',
      key: identity,
      requestId: question.id,
      status: 'submitting',
      answers,
    })
    try {
      await resumeAgentRun(question.runId, response.questionId, response.answer)
      dispatch({
        type: 'question.status',
        key: identity,
        requestId: question.id,
        status: 'answered',
        answers,
        result: 'Answer submitted',
        resume: true,
      })
      const record = selectActiveConversation(stateRef.current, identity)
      connectRun(identity, question.runId, record.lastSequence ?? '0')
    } catch (error) {
      dispatch({
        type: 'question.status',
        key: identity,
        requestId: question.id,
        status: 'error',
        answers,
        result: errorMessage(error, 'Unable to submit the answer.'),
      })
    }
  }, [connectRun])

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
        abortTurnOperation(handoff.operationId, true)
        handoffRef.current = null
      } else {
        const operation = findTurnOperation(turnControllersRef.current, previous)
        if (operation) abortTurnOperation(operation.operationId, true)
      }
    }
    previousIdentityRef.current = activeIdentity
  }, [abortTurnOperation, activeKey, activeIdentity])

  useEffect(() => {
    const desired = new Set<string>()
    for (const [id, record] of Object.entries(state.conversationsById)) {
      if (!record.activeRunId || record.turn.error) continue
      desired.add(record.activeRunId)
      connectRun({ kind: 'existing', id }, record.activeRunId, record.lastSequence ?? '0')
    }
    for (const runId of runSubscriptionsRef.current.keys()) {
      if (!desired.has(runId)) closeRunSocket(runId)
    }
  }, [closeRunSocket, connectRun, state.conversationsById])

  useEffect(() => {
    if (activeIdentity.kind !== 'existing') return
    const record = state.conversationsById[activeIdentity.id]
    if (!record || record.detail.status === 'idle') {
      void ensureDetail(activeIdentity.id)
    } else if (record.activeRunId && record.turn.status === 'loading') {
      connectRun(activeIdentity, record.activeRunId, record.lastSequence ?? '0')
    }
  }, [activeKey, activeIdentity, connectRun, ensureDetail, state.conversationsById])

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
        closeAllRunSockets()
      })
    }
  }, [closeAllRunSockets])

  return {
    state,
    catalog: state.catalog,
    activeIdentity,
    activeConversation,
    retryActive,
    retryTurn,
    answerQuestion,
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
