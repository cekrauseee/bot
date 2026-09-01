import { useDeferredValue, useId, useMemo, useState, type ReactNode } from 'react'
import { PageEntranceItem } from '@/components/page-entrance'

import { AnimatedSidebarInset } from '@/components/motion/animated-sidebar'
import { Button } from '@/components/motion/button/base'
import type { ButtonState } from '@/components/motion/button/stateful'
import { ConversationTranscriptSkeleton } from '@/features/chat/components/loading/conversation-skeleton'
import { useLoadingPresence } from '@/features/chat/components/loading/use-loading-presence'
import { useScrollBoundary } from '@/features/chat/hooks/use-scroll-boundary'
import { useSubmittedTurn } from '@/features/chat/hooks/use-submitted-turn'
import type {
  ChatBrowserFrame,
  ChatBrowserSession,
  ChatMessage,
  ChatModelOption,
  ChatQuestionAnswers,
  ChatQuestionRequest,
  ChatReasoningEffort,
  ChatReasoningOption,
  ChatTodo,
  ChatUserView,
  ConversationSummary,
  ProjectSummary,
} from '@/features/chat/model'
import {
  conversationPaneKind,
  type ConversationPaneKind,
} from '@/features/chat/motion/conversation-motion'
import type { ResourceStatus } from '@/features/chat/state/conversation-controller'
import { ChatComposer } from '../composer/chat-composer'
import { BrowserPip } from '../browser/browser-pip'
import { ChatMessageList } from '../messages/chat-message-list'
import { ResponseError } from '../messages/response-error'
import { ChatSidebar } from '../sidebar/chat-sidebar'
import { ChatHeader } from './chat-header'
import { ConversationPanePresence } from './conversation-pane-presence'
import { ChatShell } from './chat-shell'
import { chatWorkspaceMode } from './chat-workspace-state'
import { createConversationEntry } from '../../motion/conversation-entry'
import { cn } from '@/lib/utils'

export type ChatWorkspaceProps = {
  title: string
  loadingTitle: boolean
  conversationKey: string
  submissionId?: string
  messages: ChatMessage[]
  plan: ChatTodo[]
  browser?: ChatBrowserSession
  browserFrame?: ChatBrowserFrame
  models: ChatModelOption[]
  reasoningOptions: ChatReasoningOption[]
  user: ChatUserView
  reasoningEffort: ChatReasoningEffort
  model: string
  fastMode: boolean
  signOutStatus: ButtonState
  streaming: boolean
  runActive: boolean
  status: string
  detailStatus: ResourceStatus
  detailError: string
  turnError: string
  submittedPrompt?: string
  canRetryTurn: boolean
  onRetryTurn?: () => void
  pendingConversationIds: readonly string[]
  conversations: ConversationSummary[]
  projects: ProjectSummary[]
  catalogStatus: ResourceStatus
  catalogError: string
  activeConversationId?: string
  onRetryLoad: () => void
  onRetryCatalog: () => void
  onNewTask: () => void
  onProjectReorder: (ids: string[]) => Promise<void>
  onProjectRename: (id: string, name: string) => Promise<void>
  onProjectDelete: (id: string) => Promise<void>
  onProjectCreate: (name: string) => Promise<ProjectSummary>
  onConversationSelect: (conversation: ConversationSummary) => void
  onConversationPin: (id: string, pinned: boolean) => Promise<void>
  onPinnedReorder: (ids: string[]) => Promise<void>
  onConversationMove: (conversationId: string, projectId: string | null) => Promise<void>
  onConversationRename: (id: string, title: string) => Promise<void>
  onConversationDelete: (id: string) => Promise<void>
  onComposerSubmit: (value: string, model?: string, onAccepted?: () => void) => void | Promise<void>
  onComposerStop: () => void
  onReasoningChange: (value: ChatReasoningEffort) => void
  onModelChange: (value: string) => void
  onSpeedChange: (value: boolean) => void
  onQuestionSubmit: (
    request: ChatQuestionRequest,
    answers: ChatQuestionAnswers,
  ) => void
  onSignOut: () => void
}

function TranscriptError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 px-5 text-center">
      <div className="w-full max-w-md">
        <ResponseError title="Conversation unavailable" message={message} onRetry={onRetry} retryLabel="Reload conversation" />
      </div>
    </div>
  )
}

export function ChatWorkspace({
  title,
  loadingTitle,
  conversationKey,
  submissionId,
  messages,
  plan,
  browser,
  browserFrame,
  models,
  reasoningOptions,
  user,
  reasoningEffort,
  model,
  fastMode,
  signOutStatus,
  streaming,
  runActive,
  status,
  detailStatus,
  detailError,
  turnError,
  submittedPrompt,
  canRetryTurn,
  onRetryTurn,
  pendingConversationIds,
  conversations,
  projects,
  catalogStatus,
  catalogError,
  activeConversationId,
  onRetryLoad,
  onRetryCatalog,
  onNewTask,
  onProjectReorder,
  onProjectRename,
  onProjectDelete,
  onProjectCreate,
  onConversationSelect,
  onConversationPin,
  onPinnedReorder,
  onConversationMove,
  onConversationRename,
  onConversationDelete,
  onComposerSubmit,
  onComposerStop,
  onReasoningChange,
  onModelChange,
  onSpeedChange,
  onQuestionSubmit,
  onSignOut,
}: ChatWorkspaceProps) {
  const composerViewportId = useId()
  const [entry] = useState(createConversationEntry)
  const centered = chatWorkspaceMode({
    activeConversationId,
    messageCount: messages.length,
    streaming,
    turnError,
  }) === 'centered'
  const [initialConversationKey] = useState(conversationKey)
  const latestUserMessage = messages.findLast((message) => message.role === 'user')
  const anchorMessageKey = useSubmittedTurn({
    conversationKey,
    submissionId,
    messageKey: latestUserMessage?.renderKey ?? latestUserMessage?.id,
  })
  // Commit the current route and composer geometry before mounting rich history.
  // Never present deferred messages beneath a different conversation identity.
  const currentTranscript = useMemo(() => ({
    conversationKey, messages, anchorMessageKey,
    ready: detailStatus === 'ready' || detailStatus === 'refreshing' || messages.length > 0,
  }), [conversationKey, messages, detailStatus, anchorMessageKey])
  const deferredTranscript = useDeferredValue(currentTranscript)
  const latestMessage = messages.at(-1)
  const awaitingTranscript = deferredTranscript.conversationKey !== conversationKey ||
    (currentTranscript.ready && !deferredTranscript.ready)
  const activeProjectId = conversations.find((conversation) =>
    conversation.id === activeConversationId)?.project_id
  const activeProjectName = projects.find((project) =>
    project.id === activeProjectId)?.name
  const paneKind: ConversationPaneKind = awaitingTranscript ? 'loading' : conversationPaneKind({
    status: detailStatus,
    messageCount: messages.length,
  })
  const detailPending = Boolean(activeConversationId) && paneKind === 'loading'
  const { scrolled: transcriptScrolled, attachViewport: attachTranscript } =
    useScrollBoundary(`${conversationKey}:${paneKind}`)
  const showDetailSkeleton = useLoadingPresence({
    show: detailPending,
    presenceKey: conversationKey,
    defer: initialConversationKey !== conversationKey,
  })
  const cachedDetailError = paneKind === 'ready' && detailStatus === 'error'
  const detailStatusText = detailPending
    ? 'Loading conversation…'
    : cachedDetailError
      ? detailError
      : paneKind === 'not-found'
        ? 'Conversation not found'
        : paneKind === 'error'
        ? detailError
        : status
  const browserVisible = Boolean(browser && browser.status !== 'closed')

  let transcript: ReactNode
  if (paneKind === 'loading') {
    transcript = showDetailSkeleton ? <ConversationTranscriptSkeleton /> : null
  } else if (paneKind === 'error') {
    transcript = (
      <TranscriptError onRetry={onRetryLoad} message={detailError || 'Unable to load the conversation.'} />
    )
  } else if (paneKind === 'not-found') {
    transcript = (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 px-5 text-center">
        <p className="text-sm text-foreground">Conversation not found</p>
        <Button onClick={onNewTask}>New conversation</Button>
      </div>
    )
  } else {
    transcript = (
      <div className="flex h-full min-h-0 flex-col">
        <div className="min-h-0 flex-1">
          <ChatMessageList
            key={conversationKey}
            messages={deferredTranscript.messages}
            revealHistory
            viewportRef={attachTranscript}
            entry={entry}
            conversationKey={conversationKey}
            anchorMessageKey={deferredTranscript.anchorMessageKey}
            retryingMessageKey={streaming && latestMessage?.retryError ? latestMessage.renderKey ?? latestMessage.id : undefined}
            canRetryTurn={deferredTranscript === currentTranscript && canRetryTurn} onRetryTurn={onRetryTurn}
            onReloadConversation={activeConversationId ? onRetryLoad : undefined}
            onQuestionSubmit={onQuestionSubmit} />
        </div>
        {cachedDetailError ? (
          <div className="mx-auto w-full max-w-3xl px-6 pb-6">
            <ResponseError title="Could not refresh the conversation" message={detailError} onRetry={onRetryLoad} retryLabel="Reload conversation" />
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="min-h-svh bg-background">
      <ChatShell
        sidebarWidth="17rem"
        collapseSidebarBelow={600}
        className="min-h-svh rounded-none border-0"
      >
        <ChatSidebar
          user={user}
          signOutStatus={signOutStatus}
          pendingConversationIds={pendingConversationIds}
          conversations={conversations}
          projects={projects}
          catalogStatus={catalogStatus}
          catalogError={catalogError}
          activeConversationId={activeConversationId}
          onCatalogRetry={onRetryCatalog}
          onNewTask={onNewTask}
          onProjectReorder={onProjectReorder}
          onProjectRename={onProjectRename}
          onProjectDelete={onProjectDelete}
          onProjectCreate={onProjectCreate}
          onConversationSelect={onConversationSelect}
          onConversationPin={onConversationPin}
          onPinnedReorder={onPinnedReorder}
          onConversationMove={onConversationMove}
          onConversationRename={onConversationRename}
          onConversationDelete={onConversationDelete}
          onSignOut={onSignOut}
        />
        <AnimatedSidebarInset className="h-svh min-h-0">
          <ChatHeader
            scrolled={transcriptScrolled}
            conversationKey={conversationKey}
            loadingTitle={loadingTitle || detailPending}
            title={title}
            projectName={activeProjectName}
            mobileOnly={centered}
          />
          <PageEntranceItem id={composerViewportId} index={2} className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            <span role="status" aria-live="polite" className="sr-only">
              {detailStatusText}
            </span>
            <BrowserPip
              key={`docked-${browser?.id ?? 'none'}`}
              session={browser}
              frame={browserFrame}
              layout="docked"
              className="shrink-0 xl:hidden"
            />
              <div
                className={cn(
                  'relative flex min-h-0 flex-1',
                  browserVisible && 'xl:pe-96',
                )}
                aria-busy={!centered && detailPending || undefined}
                aria-hidden={centered || undefined}
                inert={centered}
              >
                <ConversationPanePresence
                  conversationKey={conversationKey}
                  paneKind={paneKind}
                >
                  {centered ? null : transcript}
                </ConversationPanePresence>
              </div>
            <BrowserPip
              key={`floating-${browser?.id ?? 'none'}`}
              session={browser}
              frame={browserFrame}
              className="absolute end-5 top-5 hidden xl:block"
            />
            <div className="pointer-events-none relative -mt-4 shrink-0">
              <ChatComposer
                entry={entry}
                conversationKey={conversationKey}
                viewportId={composerViewportId}
                plan={plan}
                models={models}
                reasoningOptions={reasoningOptions}
                reasoningEffort={reasoningEffort}
                model={model}
                fastMode={fastMode}
                loading={streaming || runActive}
                submitDisabled={runActive || (!centered && detailStatus !== 'ready')}
                submitError={centered ? turnError : undefined}
                submittedPrompt={submittedPrompt}
                centered={centered}
                onSubmit={onComposerSubmit}
                onStop={onComposerStop}
                onReasoningChange={onReasoningChange}
                onModelChange={onModelChange}
                onSpeedChange={onSpeedChange}
              />
            </div>
          </PageEntranceItem>
        </AnimatedSidebarInset>
      </ChatShell>
    </div>
  )
}
