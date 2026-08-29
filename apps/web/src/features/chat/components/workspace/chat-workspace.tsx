import type { ButtonState } from '@/components/motion/button/stateful'
import { AnimatedSidebarInset } from '@/components/motion/animated-sidebar'
import { Button } from '@/components/motion/button/base'
import type {
  ChatMessage,
  ChatModelOption,
  ChatReasoningOption,
  ChatUserView,
  ConversationSummary,
} from '@/features/chat/model'
import { ChatComposer } from '../composer/chat-composer'
import { ChatMessageList } from '../messages/chat-message-list'
import { ChatSidebar } from '../sidebar/chat-sidebar'
import { ChatHeader } from './chat-header'
import { ChatShell } from './chat-shell'

export type ChatWorkspaceProps = {
  title: string
  messages: ChatMessage[]
  models: ChatModelOption[]
  reasoningOptions: ChatReasoningOption[]
  user: ChatUserView
  reasoningEffort: string
  model: string
  fastMode: boolean
  signOutError: string
  signOutStatus: ButtonState
  loading: boolean
  streaming: boolean
  status: string
  loadError: string
  turnError: string
  conversations: ConversationSummary[]
  activeConversationId?: string
  onRetryLoad: () => void
  onNewTask: () => void
  onConversationSelect: (id: string) => void
  onConversationDelete: (id: string) => Promise<void>
  onComposerSubmit: (value: string, model?: string) => void | Promise<void>
  onComposerStop: () => void
  onReasoningChange: (value: string) => void
  onModelChange: (value: string) => void
  onSpeedChange: (value: boolean) => void
  onSignOut: () => void
}

export function ChatWorkspace({
  title,
  messages,
  models,
  reasoningOptions,
  user,
  reasoningEffort,
  model,
  fastMode,
  signOutError,
  signOutStatus,
  loading,
  streaming,
  status,
  loadError,
  turnError,
  conversations,
  activeConversationId,
  onRetryLoad,
  onNewTask,
  onConversationSelect,
  onConversationDelete,
  onComposerSubmit,
  onComposerStop,
  onReasoningChange,
  onModelChange,
  onSpeedChange,
  onSignOut,
}: ChatWorkspaceProps) {
  const empty = !loading && !loadError && messages.length === 0
  const composer = (
    <ChatComposer
      models={models}
      reasoningOptions={reasoningOptions}
      reasoningEffort={reasoningEffort}
      model={model}
      fastMode={fastMode}
      loading={streaming}
      centered={empty}
      onSubmit={onComposerSubmit}
      onStop={onComposerStop}
      onReasoningChange={onReasoningChange}
      onModelChange={onModelChange}
      onSpeedChange={onSpeedChange}
    />
  )

  return (
    <main className="min-h-svh bg-background">
      <ChatShell
        sidebarWidth="17rem"
        collapseSidebarBelow={600}
        className="min-h-svh rounded-none border-0"
      >
        <ChatSidebar
          user={user}
          signOutError={signOutError}
          signOutStatus={signOutStatus}
          conversations={conversations}
          activeConversationId={activeConversationId}
          onNewTask={onNewTask}
          onConversationSelect={onConversationSelect}
          onConversationDelete={onConversationDelete}
          onSignOut={onSignOut}
        />
        <AnimatedSidebarInset className="h-svh min-h-0">
          <ChatHeader title={title} />
          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            <span aria-live="polite" className="sr-only">{status}</span>
            {loading ? (
              <div className="grid min-h-0 flex-1 place-items-center" aria-busy="true">
                <p role="status" className="text-sm text-muted-foreground">
                  Loading conversation…
                </p>
              </div>
            ) : loadError ? (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-5 text-center">
                <p role="alert" className="text-sm text-destructive">{loadError}</p>
                <Button onClick={onRetryLoad}>Try again</Button>
              </div>
            ) : empty ? (
              <div className="flex min-h-0 flex-1 items-center justify-center px-4 pb-12">
                {composer}
              </div>
            ) : (
              <>
                <div className="min-h-0 flex-1">
                  <ChatMessageList messages={messages} />
                </div>
                {turnError ? (
                  <p
                    role="alert"
                    className="mx-auto w-full max-w-2xl px-6 pb-2 text-sm text-destructive"
                  >
                    {turnError}
                  </p>
                ) : null}
                {composer}
              </>
            )}
          </div>
        </AnimatedSidebarInset>
      </ChatShell>
    </main>
  )
}
