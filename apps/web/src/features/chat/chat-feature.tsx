import { useCallback, useEffect, useState } from 'react'

import type { ButtonState } from '@/components/motion/button/stateful'
import { ChatWorkspace } from './components/workspace/chat-workspace'
import { deletedActiveConversationPath } from './conversation-path'
import { useConversationController } from './hooks/use-conversation-controller'
import { resolveConversationTitle } from './motion/conversation-motion'
import { conversationRouteIdentity } from './state/conversation-controller'
import type {
  ChatModelOption,
  ChatReasoningOption,
  ChatUserView,
  ConversationSummary,
} from './model'

const models: ChatModelOption[] = [
  { value: 'gpt-5.6-sol', label: 'GPT 5.6 Sol' },
  { value: 'gpt-5.6-luna', label: 'GPT 5.6 Luna' },
]

const reasoningOptions: ChatReasoningOption[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'Extra high' },
  { value: 'max', label: 'Max' },
]

type ReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

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
  const { send, stop, retryTurn } = conversation
  const [model, setModel] = useState<'gpt-5.6-sol' | 'gpt-5.6-luna'>('gpt-5.6-sol')
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>('medium')
  const [fastMode, setFastMode] = useState(() => {
    try {
      return localStorage.getItem('mybot-speed') === 'fast'
    } catch {
      return false
    }
  })

  const submitComposer = useCallback((value: string, selectedModel?: string, onAccepted?: () => void) => send(
    conversationRouteIdentity(conversationId), value,
    selectedModel === 'gpt-5.6-luna' ? 'gpt-5.6-luna' : 'gpt-5.6-sol',
    reasoningEffort, fastMode ? 'fast' : 'standard', undefined, onAccepted,
  ), [send, conversationId, reasoningEffort, fastMode])
  const stopComposer = useCallback(() => stop(conversationRouteIdentity(conversationId)), [stop, conversationId])
  const retryResponse = useCallback(() => { void retryTurn(conversationRouteIdentity(conversationId)) }, [retryTurn, conversationId])
  const changeReasoning = useCallback((value: string) => setReasoningEffort(value as ReasoningEffort), [])
  const changeModel = useCallback((value: string) => setModel(
    value === 'gpt-5.6-luna' ? 'gpt-5.6-luna' : 'gpt-5.6-sol',
  ), [])

  useEffect(() => {
    try {
      localStorage.setItem('mybot-speed', fastMode ? 'fast' : 'standard')
    } catch {
      // Browser storage is an optional preference, not conversation state.
    }
  }, [fastMode])

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
    if (activeConversation.turn.status === 'loading') conversation.stop(activeIdentity)
    navigate()
  }

  const streaming = activeConversation.turn.status === 'loading'
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
      submissionId={activeConversation.submissionId}
      models={models}
      reasoningOptions={reasoningOptions}
      user={user}
      reasoningEffort={reasoningEffort}
      model={model}
      fastMode={fastMode}
      signOutStatus={signOutStatus}
      streaming={streaming}
      status={streaming ? 'Responding…' : ''}
      detailStatus={activeConversation.detail.status}
      detailError={activeConversation.detail.error}
      turnError={activeConversation.turn.error}
      submittedPrompt={activeConversation.lastTurnInput?.message}
      canRetryTurn={Boolean(activeConversation.lastTurnInput) && !streaming}
      onRetryTurn={activeConversation.lastTurnInput ? retryResponse : undefined}
      pendingConversationIds={[...(conversation.state.newConversation.id && conversation.state.newConversation.turn.status === 'loading'
        ? [conversation.state.newConversation.id] : []), ...Object.entries(conversation.state.conversationsById)
        .filter(([, record]) => record.turn.status === 'loading')
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
      onSpeedChange={setFastMode}
      onSignOut={onSignOut}
    />
  )
}
