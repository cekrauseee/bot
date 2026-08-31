import type { ButtonState } from '@/components/motion/button/stateful'
import { AnimatedSidebarInset } from '@/components/motion/animated-sidebar'
import { Button } from '@/components/motion/button/base'
import type {
  ChatApprovalDecision,
  ChatBrowserFrame,
  ChatBrowserSession,
  ChatMessage,
  ChatModelOption,
  ChatQuestionAnswers,
  ChatQuestionRequest,
  ChatReasoningEffort,
  ChatTodo,
  ChatUserView,
  ConversationSummary,
  ProjectSummary,
} from '@/features/chat/model'
import { cn } from '@/lib/utils'
import { BrowserPip } from '../browser/browser-pip'
import { ChatComposer } from '../composer/chat-composer'
import { ChatMessageList } from '../messages/chat-message-list'
import { ChatSidebar } from '../sidebar/chat-sidebar'
import { ChatHeader } from './chat-header'
import { ChatShell } from './chat-shell'

export type ChatWorkspaceProps = {
  title: string
  messages: ChatMessage[]
  plan: ChatTodo[]
  browser?: ChatBrowserSession
  browserFrame?: ChatBrowserFrame
  models: ChatModelOption[]
  user: ChatUserView
  reasoningEffort: ChatReasoningEffort
  model: string
  fastMode: boolean
  signOutError: string
  signOutStatus: ButtonState
  loading: boolean
  streaming: boolean
  runActive: boolean
  status: string
  loadError: string
  turnError: string
  conversations: ConversationSummary[]
  projects: ProjectSummary[]
  activeConversationId?: string
  onRetryLoad: () => void
  onNewTask: () => void
  onProjectCreate: (name: string) => Promise<ProjectSummary>
  onConversationSelect: (conversation: ConversationSummary) => void
  onConversationMove: (conversationId: string, projectId: string | null) => Promise<void>
  onConversationDelete: (id: string) => Promise<void>
  onComposerSubmit: (value: string, model?: string) => void | Promise<void>
  onComposerStop: () => void
  onReasoningChange: (value: ChatReasoningEffort) => void
  onModelChange: (value: string) => void
  onSpeedChange: (value: boolean) => void
  onApprovalDecision: (blockId: string, decision: ChatApprovalDecision) => void
  onQuestionSubmit: (
    request: ChatQuestionRequest,
    answers: ChatQuestionAnswers,
  ) => void
  onSignOut: () => void
}

export function ChatWorkspace({
  title,
  messages,
  plan,
  browser,
  browserFrame,
  models,
  user,
  reasoningEffort,
  model,
  fastMode,
  signOutError,
  signOutStatus,
  loading,
  streaming,
  runActive,
  status,
  loadError,
  turnError,
  conversations,
  projects,
  activeConversationId,
  onRetryLoad,
  onNewTask,
  onProjectCreate,
  onConversationSelect,
  onConversationMove,
  onConversationDelete,
  onComposerSubmit,
  onComposerStop,
  onReasoningChange,
  onModelChange,
  onSpeedChange,
  onApprovalDecision,
  onQuestionSubmit,
  onSignOut,
}: ChatWorkspaceProps) {
  const empty = !loading && !loadError && messages.length === 0
  const activeProjectId = conversations.find((conversation) =>
    conversation.id === activeConversationId)?.project_id
  const activeProjectName = projects.find((project) =>
    project.id === activeProjectId)?.name
  const composer = (
    <ChatComposer
      plan={plan}
      models={models}
      reasoningEffort={reasoningEffort}
      model={model}
      fastMode={fastMode}
      loading={streaming || runActive}
      centered={empty}
      onSubmit={onComposerSubmit}
      onStop={runActive ? onComposerStop : undefined}
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
          projects={projects}
          activeConversationId={activeConversationId}
          onNewTask={onNewTask}
          onProjectCreate={onProjectCreate}
          onConversationSelect={onConversationSelect}
          onConversationMove={onConversationMove}
          onConversationDelete={onConversationDelete}
          onSignOut={onSignOut}
        />
        <AnimatedSidebarInset className="h-svh min-h-0">
          <ChatHeader
            title={title}
            projectName={activeProjectName}
            mobileOnly={!activeConversationId}
          />
          <div className={cn(
            "relative flex min-h-0 flex-1 flex-col overflow-hidden",
            browser && browser.status !== 'closed' && "xl:pe-96",
          )}>
            <span aria-live="polite" className="sr-only">{status}</span>
            <BrowserPip
              key={`docked-${browser?.id ?? 'none'}`}
              session={browser}
              frame={browserFrame}
              layout="docked"
              className="shrink-0 xl:hidden"
            />
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
                  <ChatMessageList
                    messages={messages}
                    onApprovalDecision={onApprovalDecision}
                    onQuestionSubmit={onQuestionSubmit}
                  />
                </div>
                {turnError ? (
                  <p
                    role="alert"
                    className="mx-auto w-full max-w-3xl px-6 pb-2 text-sm text-destructive"
                  >
                    {turnError}
                  </p>
                ) : null}
                {composer}
              </>
            )}
            <BrowserPip
              key={`floating-${browser?.id ?? 'none'}`}
              session={browser}
              frame={browserFrame}
              className="absolute end-5 top-5 hidden xl:block"
            />
          </div>
        </AnimatedSidebarInset>
      </ChatShell>
    </main>
  )
}
