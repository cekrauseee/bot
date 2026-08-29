import { useEffect, useState } from 'react'

import type { ButtonState } from '@/components/motion/button/stateful'
import { ChatWorkspace } from './components/workspace/chat-workspace'
import { useConversation } from './services/conversation-api'
import type {
  ChatModelOption,
  ChatReasoningOption,
  ChatUserView,
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
  signOutError: string
  signOutStatus: ButtonState
  conversationId?: string
  onNewTask: () => void
  onConversationStarted: (id: string) => void
  onConversationSelect: (id: string) => void
  onConversationDelete: (id: string) => void
  onSignOut: () => void
}

export function ChatFeature({
  user,
  signOutError,
  signOutStatus,
  conversationId,
  onNewTask,
  onConversationStarted,
  onConversationSelect,
  onConversationDelete,
  onSignOut,
}: ChatFeatureProps) {
  const conversation = useConversation(conversationId, onConversationStarted)
  const [model, setModel] = useState<'gpt-5.6-sol' | 'gpt-5.6-luna'>('gpt-5.6-sol')
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>('medium')
  const [fastMode, setFastMode] = useState(() => {
    try {
      return localStorage.getItem('mybot-speed') === 'fast'
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem('mybot-speed', fastMode ? 'fast' : 'standard')
    } catch {
      // Browser storage is an optional preference, not conversation state.
    }
  }, [fastMode])

  const leaveCurrentConversation = (navigate: () => void) => {
    if (conversation.streaming) conversation.stop()
    navigate()
  }

  return (
    <ChatWorkspace
      title={conversation.title}
      messages={conversation.messages}
      models={models}
      reasoningOptions={reasoningOptions}
      user={user}
      reasoningEffort={reasoningEffort}
      model={model}
      fastMode={fastMode}
      signOutError={signOutError}
      signOutStatus={signOutStatus}
      loading={conversation.loading}
      streaming={conversation.streaming}
      status={conversation.status}
      loadError={conversation.loadError}
      turnError={conversation.turnError}
      conversations={conversation.conversations}
      activeConversationId={conversationId}
      onRetryLoad={conversation.reload}
      onNewTask={() => leaveCurrentConversation(onNewTask)}
      onConversationSelect={(id) =>
        leaveCurrentConversation(() => onConversationSelect(id))}
      onConversationDelete={async (id) => {
        await conversation.remove(id)
        onConversationDelete(id)
      }}
      onComposerSubmit={(value, model) => conversation.send(
        value,
        model === 'gpt-5.6-luna' ? 'gpt-5.6-luna' : 'gpt-5.6-sol',
        reasoningEffort,
        fastMode ? 'fast' : 'standard',
      )}
      onComposerStop={conversation.stop}
      onReasoningChange={(value) => setReasoningEffort(value as ReasoningEffort)}
      onModelChange={(value) => setModel(
        value === 'gpt-5.6-luna' ? 'gpt-5.6-luna' : 'gpt-5.6-sol',
      )}
      onSpeedChange={setFastMode}
      onSignOut={onSignOut}
    />
  )
}
