import { useCallback, useEffect, useMemo, useState } from 'react'

import type { ButtonState } from '@/components/motion/button/stateful'
import { ChatWorkspace } from './components/workspace/chat-workspace'
import { deletedActiveConversationPath } from './conversation-path'
import { useConversationController } from './hooks/use-conversation-controller'
import { resolveConversationTitle } from './motion/conversation-motion'
import {
  FALLBACK_MODEL_CATALOG,
  normalizeModelSelection,
  type ChatModelSelection,
} from './model-catalog'
import { conversationRouteIdentity } from './state/conversation-controller'
import type {
  ChatUserView,
  ConversationSummary,
} from './model'

const defaultSelection: ChatModelSelection = {
  model: 'gpt-5.6-sol',
  reasoningEffort: 'medium',
  processingMode: 'standard',
}

const savedSelection = (): ChatModelSelection => {
  try {
    const reasoningEffort = localStorage.getItem('mybot-reasoning')
    const processingMode = localStorage.getItem('mybot-speed')
    return {
      model: localStorage.getItem('mybot-model') || defaultSelection.model,
      reasoningEffort:
        reasoningEffort === 'none' || reasoningEffort === 'low' ||
        reasoningEffort === 'medium' || reasoningEffort === 'high' ||
        reasoningEffort === 'xhigh' || reasoningEffort === 'max'
          ? reasoningEffort
          : defaultSelection.reasoningEffort,
      processingMode: processingMode === 'fast' ? 'fast' : 'standard',
    }
  } catch {
    return defaultSelection
  }
}

export type ChatFeatureProps = {
  user: ChatUserView
  signOutStatus: ButtonState
  conversationId?: string
  projectSlug?: string
  onNewTask: () => void
  onConversationStarted: (id: string) => void
  onConversationSelect: (id: string, projectSlug?: string, replace?: boolean) => void
  onConversationDelete: (id: string) => void
  onSignOut: () => void
}

export function ChatFeature({
  user,
  signOutStatus,
  conversationId,
  projectSlug,
  onNewTask,
  onConversationStarted,
  onConversationSelect,
  onConversationDelete,
  onSignOut,
}: ChatFeatureProps) {
  const conversation = useConversationController(conversationId, onConversationStarted)
  const { activeConversation, activeIdentity, catalog } = conversation
  const { answerQuestion, send, stop, retryTurn } = conversation
  const models = catalog.models.length ? catalog.models : FALLBACK_MODEL_CATALOG
  const [selection, setSelection] = useState(savedSelection)
  const normalizedSelection = useMemo(
    () => normalizeModelSelection(models, selection),
    [models, selection],
  )
  const selected = normalizedSelection ?? defaultSelection
  const selectedModel = models.find((item) => item.value === selected.model) ?? models[0]

  const submitComposer = useCallback((value: string, model?: string, onAccepted?: () => void) => {
    const next = normalizeModelSelection(models, { ...selected, model })
    if (!next) return
    return send(
      conversationRouteIdentity(conversationId),
      value,
      next.model,
      next.reasoningEffort,
      next.processingMode,
      undefined,
      onAccepted,
    )
  }, [conversationId, models, selected, send])
  const stopComposer = useCallback(() => stop(conversationRouteIdentity(conversationId)), [stop, conversationId])
  const retryResponse = useCallback(() => { void retryTurn(conversationRouteIdentity(conversationId)) }, [retryTurn, conversationId])
  const changeReasoning = useCallback((value: typeof selected.reasoningEffort) => {
    const next = normalizeModelSelection(models, { ...selected, reasoningEffort: value })
    if (next) setSelection(next)
  }, [models, selected])
  const changeModel = useCallback((value: string) => {
    const next = normalizeModelSelection(models, { ...selected, model: value })
    if (next) setSelection(next)
  }, [models, selected])
  const changeSpeed = useCallback((fast: boolean) => {
    const next = normalizeModelSelection(models, {
      ...selected,
      processingMode: fast ? 'fast' : 'standard',
    })
    if (next) setSelection(next)
  }, [models, selected])
  const submitQuestion = useCallback((
    request: Parameters<typeof answerQuestion>[1],
    answers: Parameters<typeof answerQuestion>[2],
  ) => {
    void answerQuestion(conversationRouteIdentity(conversationId), request, answers)
  }, [answerQuestion, conversationId])

  useEffect(() => {
    if (!normalizedSelection) return
    try {
      localStorage.setItem('mybot-model', normalizedSelection.model)
      localStorage.setItem('mybot-reasoning', normalizedSelection.reasoningEffort)
      localStorage.setItem('mybot-speed', normalizedSelection.processingMode)
    } catch {
      // Browser storage is an optional preference, not conversation state.
    }
  }, [normalizedSelection])

  useEffect(() => {
    if (
      (catalog.status !== 'ready' && catalog.status !== 'refreshing') ||
      !conversationId
    ) return
    const active = catalog.conversations.find((item) => item.id === conversationId)
    if (!active) return
    const actualProjectSlug = catalog.projects.find((project) =>
      project.id === active.project_id)?.slug
    if (actualProjectSlug !== projectSlug) {
      onConversationSelect(conversationId, actualProjectSlug, true)
    }
  }, [
    catalog.status,
    catalog.conversations,
    catalog.projects,
    conversationId,
    projectSlug,
    onConversationSelect,
  ])

  useEffect(() => {
    if (
      conversationId &&
      deletedActiveConversationPath(conversationId, catalog.deletedConversationIds)
    ) {
      onConversationDelete(conversationId)
    }
  }, [catalog.deletedConversationIds, conversationId, onConversationDelete])

  const leaveCurrentConversation = (navigate: () => void) => {
    navigate()
  }

  const streaming = activeConversation.turn.status === 'loading'
  const runActive = Boolean(activeConversation.activeRunId)
  const activeSummary = activeIdentity.kind === 'existing'
    ? catalog.conversations.find((item) => item.id === activeIdentity.id)
    : undefined
  const resolvedTitle = resolveConversationTitle({
    detailTitle: activeSummary?.title_updated_at ? activeSummary.title : activeConversation.title,
    summaryTitle: activeSummary?.title,
    status: activeConversation.detail.status,
  })

  return (
    <ChatWorkspace
      title={resolvedTitle.title}
      loadingTitle={resolvedTitle.loading}
      conversationKey={activeConversation.viewKey ?? (activeIdentity.kind === 'new'
        ? 'new'
        : `existing:${activeIdentity.id}`)}
      messages={activeConversation.messages}
      plan={activeConversation.plan}
      browser={activeConversation.browser}
      browserFrame={activeConversation.browserFrame}
      submissionId={activeConversation.submissionId}
      models={models}
      reasoningOptions={selectedModel?.reasoningOptions ?? []}
      user={user}
      reasoningEffort={selected.reasoningEffort}
      model={selected.model}
      fastMode={selected.processingMode === 'fast'}
      signOutStatus={signOutStatus}
      streaming={streaming}
      runActive={runActive}
      status={streaming ? 'Responding…' : runActive ? 'Waiting for your input…' : ''}
      detailStatus={activeConversation.detail.status}
      detailError={activeConversation.detail.error}
      turnError={activeConversation.turn.error}
      submittedPrompt={activeConversation.lastTurnInput?.message}
      canRetryTurn={Boolean(activeConversation.lastTurnInput) && !streaming && !runActive}
      onRetryTurn={activeConversation.lastTurnInput ? retryResponse : undefined}
      pendingConversationIds={[...(conversation.state.newConversation.id && conversation.state.newConversation.activeRunId
        ? [conversation.state.newConversation.id] : []), ...Object.entries(conversation.state.conversationsById)
        .filter(([, record]) => Boolean(record.activeRunId))
        .map(([id]) => id)]}
      conversations={catalog.conversations}
      projects={catalog.projects}
      catalogStatus={catalog.status}
      catalogError={catalog.error}
      activeConversationId={conversationId}
      onRetryLoad={conversation.retryActive}
      onRetryCatalog={() => void conversation.reloadCatalog(true)}
      onNewTask={() => leaveCurrentConversation(onNewTask)}
      onProjectRename={conversation.renameProject}
      onProjectReorder={conversation.reorderProjects}
      onProjectDelete={conversation.removeProject}
      onProjectCreate={conversation.createProject}
      onConversationSelect={(selected: ConversationSummary) => {
        const selectedProject = catalog.projects.find((project) =>
          project.id === selected.project_id)
        leaveCurrentConversation(() =>
          onConversationSelect(selected.id, selectedProject?.slug))
      }}
      onConversationPin={conversation.pin}
      onPinnedReorder={conversation.reorderPins}
      onConversationMove={conversation.moveToProject}
      onConversationDelete={conversation.remove}
      onConversationRename={conversation.rename}
      onComposerSubmit={submitComposer}
      onComposerStop={stopComposer}
      onReasoningChange={changeReasoning}
      onModelChange={changeModel}
      onSpeedChange={changeSpeed}
      onQuestionSubmit={submitQuestion}
      onSignOut={onSignOut}
    />
  )
}
