import type {
  ChatActivityItem,
  ChatMessage,
  ChatMessageBlock,
  ConversationSummary,
  ProjectSummary,
  SearchSource,
} from '../model'
import {
  mapApiMessage,
  type ConversationDetail,
  type SearchStep,
  type StreamEvent,
  type TurnInput,
} from '../services/conversation-api'
import { mergeConversationPin } from './pinned-conversations'
import { mergeConversationMetadata } from './conversation-metadata'
import { mergeProject, orderedProjects } from './project-order'

export type ResourceStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'refreshing'
  | 'error'
  | 'not-found'

export type OperationState = {
  operationId?: string
  status: ResourceStatus
  error: string
}

export type ConversationRecord = {
  submissionId?: string
  viewKey?: string
  lastTurnInput?: TurnInput
  id?: string
  title: string
  messages: ChatMessage[]
  detail: OperationState
  turn: OperationState
  activeAssistantId?: string
}

export type ConversationControllerState = {
  catalog: {
    conversations: ConversationSummary[]
    projects: ProjectSummary[]
    status: ResourceStatus
    error: string
    operationId?: string
    deletedProjectIds: string[]
    deletedConversationIds: string[]
  }
  newConversation: ConversationRecord
  conversationsById: Record<string, ConversationRecord>
}

export type ConversationRouteIdentity =
  | { kind: 'new' }
  | { kind: 'existing'; id: string }

export type ConversationControllerAction =
  | { type: 'catalog.load.started'; operationId: string; refreshing: boolean }
  | {
      type: 'catalog.load.succeeded'
      operationId: string
      conversations: ConversationSummary[]
      projects: ProjectSummary[]
    }
  | { type: 'catalog.load.failed'; operationId: string; error: string }
  | { type: 'catalog.load.aborted'; operationId: string }
  | { type: 'detail.load.started'; id: string; operationId: string }
  | { type: 'detail.load.succeeded'; id: string; operationId: string; detail: ConversationDetail }
  | {
      type: 'detail.load.failed'
      id: string
      operationId: string
      status: 'error' | 'not-found'
      error: string
    }
  | { type: 'detail.load.aborted'; id: string; operationId: string }
  | {
      type: 'turn.started'
      key: ConversationRouteIdentity
      operationId: string
      optimisticMessages: ChatMessage[]
      input?: TurnInput
      retryMessageId?: string
    }
  | {
      type: 'turn.event'
      key: ConversationRouteIdentity
      operationId: string
      event: StreamEvent
      at: number
      deferHandoff?: boolean
    }
  | { type: 'turn.handoff'; operationId: string; id: string }
  | {
      type: 'turn.failed'
      key: ConversationRouteIdentity
      operationId: string
      error: string
      cancelled: boolean
      retryable?: boolean
      at: number
    }
  | {
      type: 'turn.aborted'
      key: ConversationRouteIdentity
      operationId: string
      at: number
    }
  | { type: 'catalog.project.added'; project: ProjectSummary }
  | { type: 'catalog.project.renamed'; project: ProjectSummary }
  | { type: 'catalog.projects.reordered'; projects: ProjectSummary[] }
  | { type: 'catalog.conversation.renamed'; conversation: ConversationSummary }
  | { type: 'catalog.project.removed'; id: string }
  | { type: 'catalog.conversation.upserted'; conversation: ConversationSummary }
  | { type: 'catalog.pins.updated'; conversations: ConversationSummary[] }
  | { type: 'catalog.conversation.removed'; id: string }

const idleOperation = (): OperationState => ({ status: 'idle', error: '' })
const readyOperation = (): OperationState => ({ status: 'ready', error: '' })

export const createNewConversationRecord = (): ConversationRecord => ({
  title: 'New conversation',
  messages: [],
  detail: readyOperation(),
  turn: idleOperation(),
})

export const createConversationRecord = (id: string): ConversationRecord => ({
  id,
  title: 'New conversation',
  messages: [],
  detail: idleOperation(),
  turn: idleOperation(),
})

export const initialConversationControllerState = (): ConversationControllerState => ({
  catalog: {
    conversations: [],
    projects: [],
    status: 'idle',
    error: '',
    deletedProjectIds: [],
    deletedConversationIds: [],
  },
  newConversation: createNewConversationRecord(),
  conversationsById: {},
})

export const conversationRouteIdentity = (
  conversationId: string | undefined,
): ConversationRouteIdentity => conversationId
  ? { kind: 'existing', id: conversationId }
  : { kind: 'new' }

export const conversationRouteKey = (identity: ConversationRouteIdentity) =>
  identity.kind === 'new' ? 'new' : `existing:${identity.id}`

export const sameConversationRoute = (
  left: ConversationRouteIdentity,
  right: ConversationRouteIdentity,
) => conversationRouteKey(left) === conversationRouteKey(right)

export const selectActiveConversation = (
  state: ConversationControllerState,
  identity: ConversationRouteIdentity,
) => identity.kind === 'new'
  ? state.newConversation
  : state.conversationsById[identity.id] ?? createConversationRecord(identity.id)

export const detailFailureStatus = (status: number | undefined): 'error' | 'not-found' =>
  status === 404 ? 'not-found' : 'error'

export const shouldLoadConversationDetail = (
  status: ResourceStatus | undefined,
  force = false,
) => force || status === undefined || status === 'idle'

export const createOptimisticMessages = (
  message: string,
  optimisticId: string,
  startedAt: number,
): ChatMessage[] => [{
  id: `pending-user-${optimisticId}`,
  role: 'user',
  createdAt: new Date(startedAt).toISOString(),
  blocks: [{
    id: `pending-user-${optimisticId}-text`,
    type: 'text',
    content: message,
  }],
  status: 'complete',
}, {
  id: `pending-assistant-${optimisticId}`,
  role: 'assistant',
  createdAt: new Date(startedAt).toISOString(),
  blocks: [],
  status: 'streaming',
  processStartedAt: startedAt,
}]

const upsertConversation = (
  conversations: ConversationSummary[],
  conversation: ConversationSummary,
) => [
  mergeConversationMetadata(conversations.find((item) => item.id === conversation.id), conversation),
  ...conversations.filter((item) => item.id !== conversation.id),
]

const replaceConversation = (
  conversations: ConversationSummary[],
  conversation: ConversationSummary,
) => {
  if (conversations.some((item) => item.id === conversation.id)) {
    return conversations.map((item) =>
      item.id === conversation.id ? mergeConversationMetadata(item, conversation) : item)
  }
  return [...conversations, conversation].sort(
    (left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at),
  )
}

const mergeConversations = (
  current: ConversationSummary[],
  loaded: ConversationSummary[],
  deletedIds: string[],
) => {
  const conversations = new Map(loaded.map((conversation) => [conversation.id, conversation]))
  for (const conversation of current) {
    const candidate = conversations.get(conversation.id)
    if (!candidate || Date.parse(conversation.updated_at) >= Date.parse(candidate.updated_at)) {
      conversations.set(conversation.id, mergeConversationMetadata(candidate, conversation))
    } else {
      conversations.set(conversation.id, mergeConversationMetadata(conversation, candidate))
    }
  }
  return [...conversations.values()]
    .filter((conversation) => !deletedIds.includes(conversation.id))
    .sort((left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at))
}

const mergeProjects = (current: ProjectSummary[], loaded: ProjectSummary[]) => {
  const projects = new Map(loaded.map((project) => [project.id, project]))
  for (const project of current) {
    projects.set(project.id, mergeProject(projects.get(project.id), project))
  }
  return orderedProjects([...projects.values()])
}

const terminalBlocks = (blocks: ChatMessageBlock[]) => blocks.map((block) =>
  block.type === 'activity' || block.type === 'reasoning'
    ? { ...block, status: 'complete' as const }
    : block)

const elapsedProcessDuration = (message: ChatMessage, at: number) =>
  message.processStartedAt
    ? Math.max(1, Math.round((at - message.processStartedAt) / 1000))
    : message.processDuration

const updateAssistant = (
  messages: ChatMessage[],
  assistantId: string | undefined,
  update: (message: ChatMessage) => ChatMessage,
) => messages.map((message) =>
  message.role === 'assistant' && message.id === assistantId ? update(message) : message)

const safeSource = (value: unknown): SearchSource | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const source = value as Record<string, unknown>
  const title = typeof source.title === 'string' ? source.title : ''
  const rawUrl = typeof source.url === 'string' ? source.url : undefined
  let url: string | undefined
  let domain = typeof source.domain === 'string' ? source.domain : undefined
  if (rawUrl) {
    try {
      const parsed = new URL(rawUrl)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined
      url = parsed.toString()
      domain ??= parsed.hostname
    } catch {
      return undefined
    }
  }
  if (!title && !url) return undefined
  return {
    id: typeof source.id === 'string' ? source.id : url ?? title,
    title: title || url!,
    ...(domain ? { domain } : {}),
    ...(url ? { url } : {}),
  }
}

const searchItem = (step: SearchStep) => ({
  id: step.id,
  type: 'search' as const,
  query: step.query || step.label,
  results: (step.sources ?? []).map(safeSource).filter(
    (source): source is SearchSource => source !== undefined,
  ),
})

const updateProcessItems = (
  assistant: ChatMessage,
  update: (items: ChatActivityItem[]) => ChatActivityItem[],
) => {
  const processIndex = assistant.blocks.findIndex((block) => block.type === 'activity')
  if (processIndex === -1) {
    return {
      ...assistant,
      blocks: [{
        id: `${assistant.id}-activity`,
        type: 'activity' as const,
        status: 'working' as const,
        items: update([]),
      }, ...assistant.blocks],
    }
  }

  return {
    ...assistant,
    blocks: assistant.blocks.map((block, index) =>
      index === processIndex && block.type === 'activity'
        ? { ...block, items: update(block.items) }
        : block),
  }
}

const recordFor = (
  state: ConversationControllerState,
  key: ConversationRouteIdentity,
) => key.kind === 'new'
  ? state.newConversation
  : state.conversationsById[key.id] ?? createConversationRecord(key.id)

const replaceRecord = (
  state: ConversationControllerState,
  key: ConversationRouteIdentity,
  record: ConversationRecord,
): ConversationControllerState => key.kind === 'new'
  ? { ...state, newConversation: record }
  : {
      ...state,
      conversationsById: { ...state.conversationsById, [key.id]: record },
    }

const turnOwned = (record: ConversationRecord, operationId: string) =>
  record.turn.operationId === operationId

const detailOwned = (record: ConversationRecord, operationId: string) =>
  record.detail.operationId === operationId

const reconcileStarted = (
  record: ConversationRecord,
  event: Extract<StreamEvent, { type: 'turn.started' }>,
): ConversationRecord => {
  const messages = [...record.messages]
  const userIndex = messages.length - 2
  const assistantIndex = messages.length - 1
  if (userIndex >= 0) messages[userIndex] = {
    ...mapApiMessage(event.data.user_message),
    renderKey: messages[userIndex].renderKey ?? messages[userIndex].id,
  }
  if (assistantIndex >= 0) {
    const optimisticAssistant = messages[assistantIndex]
    messages[assistantIndex] = {
      ...mapApiMessage(event.data.assistant_message),
      renderKey: optimisticAssistant.renderKey ?? optimisticAssistant.id,
      retryError: optimisticAssistant.retryError,
      retryAttempted: optimisticAssistant.retryAttempted,
      processStartedAt: optimisticAssistant.processStartedAt,
      processDuration: undefined,
    }
  }
  return {
    ...record,
    id: event.data.conversation.id,
    title: event.data.conversation.title,
    messages,
    detail: readyOperation(),
    turn: { ...record.turn, status: 'loading', error: '' },
    activeAssistantId: event.data.assistant_message.id,
  }
}

const applyNonStartedEvent = (
  record: ConversationRecord,
  event: Exclude<StreamEvent, { type: 'turn.started' }>,
  at: number,
): ConversationRecord => {
  if (record.messages.at(-1)?.retryError && event.type === 'turn.completed') {
    record = { ...record, messages: updateAssistant(record.messages, record.activeAssistantId,
      (assistant) => assistant.retryError ? { ...assistant, retryError: undefined } : assistant) }
  }
  if (event.type === 'reasoning.delta') {
    return {
      ...record,
      messages: updateAssistant(record.messages, record.activeAssistantId, (assistant) =>
        updateProcessItems(assistant, (items) => {
          const last = items.at(-1)
          if (last?.type === 'text' && last.lastSequence === event.sequence - 1) {
            return [
              ...items.slice(0, -1),
              {
                ...last,
                content: last.content + event.data.delta,
                lastSequence: event.sequence,
              },
            ]
          }
          return [...items, {
            id: `${assistant.id}-reasoning-${event.sequence}`,
            type: 'text',
            content: event.data.delta,
            lastSequence: event.sequence,
          }]
        })),
    }
  }

  if (event.type === 'text.delta') {
    return {
      ...record,
      messages: updateAssistant(record.messages, record.activeAssistantId, (assistant) => {
        const existing = assistant.blocks.find((block) => block.type === 'text')
        const completedProcess = terminalBlocks(assistant.blocks)
        return {
          ...assistant,
          processDuration: elapsedProcessDuration(assistant, at),
          blocks: existing
            ? assistant.blocks.map((block) => block.type === 'text'
              ? { ...block, content: block.content + event.data.delta }
              : block)
            : [
                ...completedProcess,
                { id: `${assistant.id}-text`, type: 'text', content: event.data.delta },
              ],
        }
      }),
    }
  }

  if (
    event.type === 'step.started' ||
    event.type === 'step.updated' ||
    event.type === 'step.completed'
  ) {
    return {
      ...record,
      messages: updateAssistant(record.messages, record.activeAssistantId, (assistant) => {
        const item: ChatActivityItem = searchItem(event.data.step)
        return updateProcessItems(assistant, (items) => {
          const index = items.findIndex((entry) => entry.id === item.id)
          if (index === -1) return [...items, item]
          return items.map((entry, entryIndex) => entryIndex === index ? item : entry)
        })
      }),
    }
  }

  const failed = event.type === 'turn.failed'
  const cancelled = failed && event.data.error.code === 'cancelled'
  return {
    ...record,
    messages: updateAssistant(record.messages, record.activeAssistantId, (assistant) => ({
      ...assistant,
      blocks: terminalBlocks(assistant.blocks),
      status: failed && !cancelled ? 'error' : 'complete',
      errorMessage: failed && !cancelled ? event.data.error.message : undefined,
      retryError: undefined,
      retryable: failed && !cancelled ? event.data.error.retryable : undefined,
      processStartedAt: undefined,
      processDuration: elapsedProcessDuration(assistant, at),
    })),
    turn: {
      status: failed && !cancelled ? 'error' : 'ready',
      error: failed && !cancelled
        ? event.data.error.message || 'Unable to complete the response. Try again.'
        : '',
    },
    activeAssistantId: undefined,
  }
}

const finalizeTurn = (
  record: ConversationRecord,
  cancelled: boolean,
  error: string,
  at: number,
  retryable = true,
): ConversationRecord => ({
  ...record,
  messages: updateAssistant(record.messages, record.activeAssistantId, (assistant) => ({
    ...assistant,
    blocks: terminalBlocks(assistant.blocks),
    status: cancelled ? 'complete' : 'error',
    errorMessage: cancelled ? undefined : error,
    retryError: undefined,
    retryable: cancelled ? undefined : retryable,
    processStartedAt: undefined,
    processDuration: elapsedProcessDuration(assistant, at),
  })),
  turn: { status: cancelled ? 'ready' : 'error', error: cancelled ? '' : error },
  activeAssistantId: undefined,
})

function reduceConversationController(
  state: ConversationControllerState,
  action: ConversationControllerAction,
): ConversationControllerState {
  if (action.type === 'catalog.load.started') {
    return {
      ...state,
      catalog: {
        ...state.catalog,
        status: action.refreshing ? 'refreshing' : 'loading',
        // Keep retry feedback mounted until a failed catalog is recovered.
        error: state.catalog.error,
        operationId: action.operationId,
      },
    }
  }
  if (action.type === 'catalog.load.succeeded') {
    if (state.catalog.operationId !== action.operationId) return state
    return {
      ...state,
      catalog: {
        ...state.catalog,
        conversations: mergeConversations(
          state.catalog.conversations,
          action.conversations,
          state.catalog.deletedConversationIds,
        ),
        projects: mergeProjects(state.catalog.projects, action.projects),
        status: 'ready',
        error: '',
        operationId: undefined,
      },
    }
  }
  if (action.type === 'catalog.load.failed' || action.type === 'catalog.load.aborted') {
    if (state.catalog.operationId !== action.operationId) return state
    return {
      ...state,
      catalog: {
        ...state.catalog,
        status: action.type === 'catalog.load.aborted' ? 'idle' : 'error',
        error: action.type === 'catalog.load.aborted' ? '' : action.error,
        operationId: undefined,
      },
    }
  }
  if (action.type === 'detail.load.started') {
    const record = state.conversationsById[action.id] ?? createConversationRecord(action.id)
    return replaceRecord(state, { kind: 'existing', id: action.id }, {
      ...record,
      detail: { status: 'loading', error: '', operationId: action.operationId },
    })
  }
  if (action.type === 'detail.load.succeeded') {
    const record = state.conversationsById[action.id]
    if (!record || !detailOwned(record, action.operationId)) return state
    const lastAssistant = action.detail.messages.at(-1)
    const lastUser = action.detail.messages.at(-2)
    const effort = lastAssistant?.reasoning_effort
    const retryInput: TurnInput | undefined = lastAssistant?.role === 'assistant' &&
      lastAssistant.status === 'failed' && lastUser?.role === 'user'
      ? {
          message: lastUser.content,
          model: lastAssistant.model === 'gpt-5.6-luna' ? 'gpt-5.6-luna' : 'gpt-5.6-sol',
          reasoning_effort: effort === 'low' || effort === 'high' || effort === 'xhigh' || effort === 'max'
            ? effort : 'medium',
          speed: lastAssistant.speed === 'fast' ? 'fast' : 'standard',
        } : undefined
    const next = replaceRecord(state, { kind: 'existing', id: action.id }, {
      ...record,
      id: action.id,
      title: mergeConversationMetadata(state.catalog.conversations.find((item) => item.id === action.id), action.detail).title,
      messages: action.detail.messages.map(mapApiMessage),
      lastTurnInput: retryInput,
      detail: readyOperation(),
    })
    const conversation: ConversationSummary = {
      id: action.detail.id,
      title: action.detail.title,
      title_updated_at: action.detail.title_updated_at,
      project_id: action.detail.project_id,
      pinned_order: action.detail.pinned_order,
      pin_updated_at: action.detail.pin_updated_at,
      created_at: action.detail.created_at,
      updated_at: action.detail.updated_at,
    }
    return {
      ...next,
      catalog: {
        ...next.catalog,
        conversations: replaceConversation(next.catalog.conversations, conversation),
      },
    }
  }
  if (action.type === 'detail.load.failed' || action.type === 'detail.load.aborted') {
    const record = state.conversationsById[action.id]
    if (!record || !detailOwned(record, action.operationId)) return state
    return replaceRecord(state, { kind: 'existing', id: action.id }, {
      ...record,
      detail: action.type === 'detail.load.aborted'
        ? idleOperation()
        : { status: action.status, error: action.error },
    })
  }
  if (action.type === 'turn.started') {
    const record = recordFor(state, action.key)
    const retrying = action.retryMessageId && record.messages.at(-1)?.id === action.retryMessageId &&
      record.messages.at(-1)?.status === 'error'
    if (action.retryMessageId && !retrying) return state
    const optimistic = action.optimisticMessages
    const messages = retrying
      ? [...record.messages.slice(0, -1), {
          ...optimistic[1],
          id: record.messages.at(-1)!.id,
          renderKey: record.messages.at(-1)!.renderKey ?? record.messages.at(-1)!.id,
          retryError: record.messages.at(-1)!.errorMessage || 'The response could not be completed.',
          retryAttempted: true,
        }]
      : [...(action.key.kind === 'new' && !record.id ? [] : record.messages), ...optimistic]
    return replaceRecord(state, action.key, {
      ...record,
      submissionId: action.operationId,
      viewKey: record.viewKey ?? (action.key.kind === 'new' ? `new:${action.operationId}` : undefined),
      lastTurnInput: action.input,
      messages,
      turn: { status: 'loading', error: '', operationId: action.operationId },
      activeAssistantId: messages.at(-1)?.id,
    })
  }
  if (action.type === 'turn.event') {
    const record = recordFor(state, action.key)
    if (!turnOwned(record, action.operationId)) return state
    if (action.event.type === 'turn.started') {
      const startedEvent = action.event
      const summary = mergeConversationMetadata(
        state.catalog.conversations.find((item) => item.id === startedEvent.data.conversation.id),
        startedEvent.data.conversation,
      )
      const reconciled = { ...reconcileStarted(record, startedEvent), title: summary.title }
      const catalog = {
        ...state.catalog,
        conversations: upsertConversation(
          state.catalog.conversations,
          summary,
        ),
        deletedConversationIds: state.catalog.deletedConversationIds.filter(
          (id) => id !== startedEvent.data.conversation.id,
        ),
      }
      if (action.key.kind === 'new') {
        if (action.deferHandoff) {
          return { ...state, catalog, newConversation: reconciled }
        }
        return {
          ...state,
          catalog,
          newConversation: createNewConversationRecord(),
          conversationsById: {
            ...state.conversationsById,
            [startedEvent.data.conversation.id]: reconciled,
          },
        }
      }
      return {
        ...replaceRecord(state, action.key, reconciled),
        catalog,
      }
    }
    const nextRecord = applyNonStartedEvent(record, action.event, action.at)
    const next = replaceRecord(state, action.key, nextRecord)
    if (action.event.type !== 'turn.completed' && action.event.type !== 'turn.failed') {
      return next
    }
    const id = action.key.kind === 'existing' ? action.key.id : record.id
    const current = id
      ? next.catalog.conversations.find((conversation) => conversation.id === id)
      : undefined
    return current
      ? {
          ...next,
          catalog: {
            ...next.catalog,
            conversations: upsertConversation(next.catalog.conversations, {
              ...current,
              updated_at: new Date(action.at).toISOString(),
            }),
          },
        }
      : next
  }
  if (action.type === 'turn.handoff') {
    const record = state.newConversation
    if (record.submissionId !== action.operationId || record.id !== action.id || record.turn.status === 'error') return state
    return {
      ...state,
      newConversation: createNewConversationRecord(),
      conversationsById: { ...state.conversationsById, [action.id]: record },
    }
  }
  if (action.type === 'turn.failed' || action.type === 'turn.aborted') {
    const record = recordFor(state, action.key)
    if (!turnOwned(record, action.operationId)) return state
    return replaceRecord(state, action.key, finalizeTurn(
      record,
      action.type === 'turn.aborted' || action.cancelled,
      action.type === 'turn.aborted' ? '' : action.error,
      action.at,
      action.type === 'turn.failed' ? action.retryable : undefined,
    ))
  }
  if (action.type === 'catalog.projects.reordered') {
    const incoming = new Map(action.projects.map((project) => [project.id, project]))
    return {
      ...state,
      catalog: {
        ...state.catalog,
        projects: orderedProjects(state.catalog.projects.map((current) => {
          const order = incoming.get(current.id)
          return order ? mergeProject(current, {
            ...current, sort_order: order.sort_order, order_updated_at: order.order_updated_at,
          }) : current
        })),
      },
    }
  }
  if (action.type === 'catalog.conversation.renamed') {
    const current = state.catalog.conversations.find((item) => item.id === action.conversation.id)
    if (!current || state.catalog.deletedConversationIds.includes(current.id)) return state
    const conversation = mergeConversationMetadata(current, {
      ...current, title: action.conversation.title, title_updated_at: action.conversation.title_updated_at,
    })
    const record = state.conversationsById[current.id]
    return {
      ...state,
      catalog: { ...state.catalog, conversations: replaceConversation(state.catalog.conversations, conversation) },
      conversationsById: record ? {
        ...state.conversationsById, [current.id]: { ...record, title: conversation.title },
      } : state.conversationsById,
    }
  }
  if (action.type === 'catalog.project.renamed') {
    return {
      ...state,
      catalog: {
        ...state.catalog,
        projects: orderedProjects(state.catalog.projects.map((project) =>
          project.id === action.project.id ? mergeProject(project, action.project) : project)),
      },
    }
  }
  if (action.type === 'catalog.project.removed') {
    return {
      ...state,
      catalog: {
        ...state.catalog,
        deletedProjectIds: [...new Set([...state.catalog.deletedProjectIds, action.id])],
      },
    }
  }
  if (action.type === 'catalog.project.added') {
    return {
      ...state,
      catalog: {
        ...state.catalog,
        projects: orderedProjects([
          mergeProject(state.catalog.projects.find((project) => project.id === action.project.id), action.project),
          ...state.catalog.projects.filter((project) => project.id !== action.project.id),
        ]),
      },
    }
  }
  if (action.type === 'catalog.pins.updated') {
    return {
      ...state,
      catalog: {
        ...state.catalog,
        conversations: state.catalog.conversations.map((current) => {
          const incoming = action.conversations.find((item) => item.id === current.id)
          return incoming ? mergeConversationPin(current, {
            ...current,
            pinned_order: incoming.pinned_order,
            pin_updated_at: incoming.pin_updated_at,
          }) : current
        }),
      },
    }
  }
  if (action.type === 'catalog.conversation.upserted') {
    return {
      ...state,
      catalog: {
        ...state.catalog,
        conversations: replaceConversation(state.catalog.conversations, action.conversation),
        deletedConversationIds: state.catalog.deletedConversationIds.filter(
          (id) => id !== action.conversation.id,
        ),
      },
    }
  }
  if (action.type === 'catalog.conversation.removed') {
    const conversationsById = { ...state.conversationsById }
    delete conversationsById[action.id]
    return {
      ...state,
      conversationsById,
      catalog: {
        ...state.catalog,
        conversations: state.catalog.conversations.filter(
          (conversation) => conversation.id !== action.id,
        ),
        deletedConversationIds: [
          action.id,
          ...state.catalog.deletedConversationIds.filter((id) => id !== action.id),
        ],
      },
    }
  }
  return state
}

// A response started before deletion must never restore the project or its membership.
export function conversationControllerReducer(
  state: ConversationControllerState,
  action: ConversationControllerAction,
): ConversationControllerState {
  const next = reduceConversationController(state, action)
  const deleted = next.catalog.deletedProjectIds
  if (!deleted.length || next === state) return next
  if (
    !next.catalog.projects.some((project) => deleted.includes(project.id)) &&
    !next.catalog.conversations.some((conversation) =>
      conversation.project_id && deleted.includes(conversation.project_id))
  ) return next
  const projects = next.catalog.projects.filter((project) => !deleted.includes(project.id))
  const conversations = next.catalog.conversations.map((conversation) =>
    conversation.project_id && deleted.includes(conversation.project_id)
      ? { ...conversation, project_id: null }
      : conversation)
  return { ...next, catalog: { ...next.catalog, projects, conversations } }
}
