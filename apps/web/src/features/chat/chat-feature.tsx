import { useEffect, useMemo, useState } from 'react'

import type { ButtonState } from '@/components/motion/button/stateful'
import { ChatWorkspace } from './components/workspace/chat-workspace'
import { useConversation } from './services/conversation-api'
import type { ChatModelSelection } from './model-catalog'
import { normalizeModelSelection } from './model-catalog'
import type { ChatUserView, ConversationSummary } from './model'

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
        reasoningEffort === 'none' ||
        reasoningEffort === 'low' ||
        reasoningEffort === 'medium' ||
        reasoningEffort === 'high' ||
        reasoningEffort === 'xhigh' ||
        reasoningEffort === 'max'
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
  signOutError: string
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
  signOutError,
  signOutStatus,
  conversationId,
  projectSlug,
  onNewTask,
  onConversationStarted,
  onConversationSelect,
  onConversationDelete,
  onSignOut,
}: ChatFeatureProps) {
  const conversation = useConversation(conversationId, onConversationStarted)
  const [selection, setSelection] = useState(savedSelection)
  const normalizedSelection = useMemo(
    () => normalizeModelSelection(conversation.models, selection),
    [conversation.models, selection],
  )

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
    if (conversation.loading || !conversationId) return
    const active = conversation.conversations.find((item) => item.id === conversationId)
    if (!active) return
    const actualProjectSlug = conversation.projects.find((project) =>
      project.id === active.project_id)?.slug
    if (actualProjectSlug !== projectSlug) {
      onConversationSelect(conversationId, actualProjectSlug, true)
    }
  }, [
    conversation.loading,
    conversation.conversations,
    conversation.projects,
    conversationId,
    projectSlug,
    onConversationSelect,
  ])

  const leaveCurrentConversation = (navigate: () => void) => {
    conversation.detach()
    navigate()
  }

  return (
    <ChatWorkspace
      title={conversation.title}
      messages={conversation.messages}
      plan={conversation.plan}
      browser={conversation.browser}
      browserFrame={conversation.browserFrame}
      models={conversation.models}
      user={user}
      reasoningEffort={normalizedSelection?.reasoningEffort ?? selection.reasoningEffort}
      model={normalizedSelection?.model ?? selection.model}
      fastMode={(normalizedSelection?.processingMode ?? selection.processingMode) === 'fast'}
      signOutError={signOutError}
      signOutStatus={signOutStatus}
      loading={conversation.loading}
      streaming={conversation.streaming}
      runActive={Boolean(conversation.activeRunId)}
      status={conversation.status}
      loadError={conversation.loadError}
      turnError={conversation.turnError}
      conversations={conversation.conversations}
      projects={conversation.projects}
      activeConversationId={conversationId}
      onRetryLoad={conversation.reload}
      onNewTask={() => leaveCurrentConversation(onNewTask)}
      onProjectCreate={conversation.createProject}
      onConversationSelect={(selected: ConversationSummary) => {
        const selectedProject = conversation.projects.find((project) =>
          project.id === selected.project_id)
        leaveCurrentConversation(() =>
          onConversationSelect(selected.id, selectedProject?.slug))
      }}
      onConversationMove={async (id, projectId) => {
        await conversation.moveToProject(id, projectId)
        if (id === conversationId) {
          const target = conversation.projects.find((project) => project.id === projectId)
          onConversationSelect(id, target?.slug, true)
        }
      }}
      onConversationDelete={async (id) => {
        await conversation.remove(id)
        onConversationDelete(id)
      }}
      onComposerSubmit={(value, model) => {
        const next = normalizeModelSelection(conversation.models, {
          ...(normalizedSelection ?? selection),
          model,
        })
        if (!next) return
        return conversation.send(
          value,
          next.model,
          next.reasoningEffort,
          next.processingMode,
        )
      }}
      onComposerStop={conversation.stop}
      onReasoningChange={(value) => {
        const next = normalizeModelSelection(conversation.models, {
          ...(normalizedSelection ?? selection),
          reasoningEffort: value,
        })
        if (next) setSelection(next)
      }}
      onModelChange={(value) => {
        const next = normalizeModelSelection(conversation.models, {
          ...(normalizedSelection ?? selection),
          model: value,
        })
        if (next) setSelection(next)
      }}
      onSpeedChange={(fast) => {
        const next = normalizeModelSelection(conversation.models, {
          ...(normalizedSelection ?? selection),
          processingMode: fast ? 'fast' : 'standard',
        })
        if (next) setSelection(next)
      }}
      onApprovalDecision={conversation.decideApproval}
      onQuestionSubmit={conversation.answerQuestion}
      onSignOut={onSignOut}
    />
  )
}
