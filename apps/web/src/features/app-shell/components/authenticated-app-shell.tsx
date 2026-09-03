import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import { AppShellContext } from "@/features/app-shell/app-shell-context"
import { AppSidebar } from "@/features/app-shell/components/app-sidebar"
import { useLiveConversationTitles } from "@/features/app-shell/hooks/use-live-conversation-titles"
import { useSidebarCatalog } from "@/features/app-shell/hooks/use-sidebar-catalog"
import { authApi, type User } from "@/features/auth/api"
import { startConversationTurn } from "@/features/composer/api"
import {
  Composer,
  type ComposerPreferences,
  type ComposerSubmission,
} from "@/features/composer/components/composer"
import { useConversations } from "@/features/conversation/hooks/use-conversations"
import { DesktopAppHeader } from "@/features/app-shell/components/desktop-app-header"

type AuthenticatedAppShellProps = {
  activeConversationId: string | null
  children: ReactNode
  onConversationSelect: (conversationId: string | null) => void
  onSignedOut: () => void
  user: User
}

export function AuthenticatedAppShell({
  activeConversationId,
  children,
  onConversationSelect,
  onSignedOut,
  user,
}: AuthenticatedAppShellProps) {
  const isDesktop = Boolean(window.myBotDesktop)
  const [signingOut, setSigningOut] = useState(false)
  const [signOutFailed, setSignOutFailed] = useState(false)
  const [defaultPreferences, setDefaultPreferences] = useState({
    model: user.default_model,
    reasoningEffort: user.default_reasoning_effort,
    fastMode: user.default_speed === "fast",
  })
  const turnController = useRef<AbortController | null>(null)
  const shellRef = useRef<HTMLElement>(null)
  const composerDockRef = useRef<HTMLElement>(null)
  const catalog = useSidebarCatalog(true)
  const {
    activeRecord: activeConversationRecord,
    applyEvent: applyConversationEvent,
    consumeTurnSpacerAnchor,
    loadConversation,
  } = useConversations(activeConversationId)
  const refreshCatalog = catalog.refresh
  const setConversationPreferences = catalog.setConversationPreferences
  const upsertConversation = catalog.upsertConversation
  const activeConversation =
    catalog.conversations.find(
      (conversation) => conversation.id === activeConversationId
    ) ?? null
  const catalogFailed = catalog.catalogError !== null
  const conversationTitle =
    activeConversation?.title ??
    (activeConversationId
      ? catalogFailed
        ? "Unable to load conversation"
        : catalog.loading
          ? "Loading conversation"
          : "Conversation"
      : "New conversation")
  const centeredComposer = activeConversationId === null
  const greetingName = user.first_name?.trim()
  const greeting = greetingName
    ? `What’s on your mind today, ${greetingName}?`
    : "What’s on your mind today?"
  const context = useMemo(
    () => ({
      activeConversation,
      activeConversationRecord,
      catalogFailed,
      catalogLoading: catalog.loading,
      consumeTurnSpacerAnchor,
      loadConversation,
    }),
    [
      activeConversation,
      activeConversationRecord,
      catalogFailed,
      catalog.loading,
      consumeTurnSpacerAnchor,
      loadConversation,
    ]
  )

  const resyncConversationTitles = useCallback(() => {
    void refreshCatalog({ preserveActionError: true })
  }, [refreshCatalog])
  const subscribeTitleRun = useLiveConversationTitles({
    activeRuns: catalog.activeRuns,
    conversations: catalog.conversations,
    onConversationTitle: upsertConversation,
    onResync: resyncConversationTitles,
  })

  useEffect(
    () => () => {
      turnController.current?.abort()
    },
    []
  )

  useLayoutEffect(() => {
    const shell = shellRef.current
    const dock = composerDockRef.current
    if (!shell || !dock) return

    const updateDockHeight = () => {
      shell.style.setProperty(
        "--composer-dock-height",
        `${Math.ceil(dock.getBoundingClientRect().height)}px`
      )
    }

    updateDockHeight()
    const observer = new ResizeObserver(updateDockHeight)
    observer.observe(dock)

    return () => {
      observer.disconnect()
      shell.style.removeProperty("--composer-dock-height")
    }
  }, [])

  const handleSignOut = async () => {
    setSigningOut(true)
    setSignOutFailed(false)

    try {
      await authApi.signOut()
      await window.myBotDesktop?.clearDesktopSession()
      onSignedOut()
    } catch {
      setSigningOut(false)
      setSignOutFailed(true)
    }
  }

  const handleComposerSubmit = useCallback(
    async (submission: ComposerSubmission, onAccepted: () => void) => {
      const controller = new AbortController()
      turnController.current = controller
      let accepted = false
      let conversationId = activeConversationId

      try {
        await startConversationTurn(
          activeConversationId,
          {
            message: submission.message,
            model: submission.model,
            reasoning_effort: submission.reasoningEffort,
            speed: submission.fastMode ? "fast" : "standard",
          },
          (started) => {
            if (accepted) return
            accepted = true
            const conversation = started.conversation
            conversationId = conversation.id
            upsertConversation(conversation)
            if (!conversation.title_updated_at) {
              subscribeTitleRun({
                after: started.after,
                conversationId: conversation.id,
                runId: started.runId,
              })
            }
            onAccepted()
            onConversationSelect(conversation.id)
            void refreshCatalog()
          },
          (event) => {
            if (conversationId) {
              applyConversationEvent(conversationId, event)
            }
          },
          controller.signal
        )
      } finally {
        if (turnController.current === controller) {
          turnController.current = null
        }
      }
    },
    [
      activeConversationId,
      applyConversationEvent,
      onConversationSelect,
      refreshCatalog,
      subscribeTitleRun,
      upsertConversation,
    ]
  )

  const handlePreferencesChange = useCallback(
    async (preferences: ComposerPreferences) => {
      if (activeConversationId) {
        await setConversationPreferences(activeConversationId, preferences)
        return
      }

      const updated = await authApi.setDefaultPreferences(preferences)
      setDefaultPreferences({
        model: updated.default_model,
        reasoningEffort: updated.default_reasoning_effort,
        fastMode: updated.default_speed === "fast",
      })
    },
    [activeConversationId, setConversationPreferences]
  )

  return (
    <AppShellContext.Provider value={context}>
      <SidebarProvider className="relative h-svh min-h-0 overflow-hidden">
        {isDesktop && (
          <DesktopAppHeader
            title={centeredComposer ? "myBot" : conversationTitle}
          />
        )}
        <AppSidebar
          user={user}
          catalog={catalog}
          activeConversationId={activeConversationId}
          isDesktop={isDesktop}
          onConversationSelect={onConversationSelect}
          onSignOut={() => void handleSignOut()}
          signingOut={signingOut}
          signOutFailed={signOutFailed}
        />
        <SidebarInset
          ref={shellRef}
          id="main-content"
          className={cn("min-h-0 overflow-hidden", isDesktop && "pt-9")}
        >
          {!isDesktop && !centeredComposer && (
            <header className="flex h-12 min-w-0 shrink-0 items-center border-b px-3.5">
              <h1
                id="conversation-title"
                className="min-w-0 truncate text-sm leading-5 font-medium"
                title={conversationTitle}
              >
                {conversationTitle}
              </h1>
            </header>
          )}
          <div className="min-h-0 flex-1">{children}</div>
          <footer
            ref={composerDockRef}
            className={cn(
              "pointer-events-none absolute inset-x-0 w-full px-4",
              centeredComposer
                ? "top-1/2 -translate-y-1/2"
                : "bottom-0 pb-[max(1rem,env(safe-area-inset-bottom))]"
            )}
          >
            <div className="pointer-events-auto mx-auto w-full max-w-3xl">
              {centeredComposer && (
                <h1 className="mb-4 text-center text-xl font-medium tracking-tight text-balance">
                  {greeting}
                </h1>
              )}
              <Composer
                model={activeConversation?.model ?? defaultPreferences.model}
                reasoningEffort={
                  activeConversation?.reasoning_effort ??
                  defaultPreferences.reasoningEffort
                }
                fastMode={
                  activeConversation
                    ? activeConversation.speed === "fast"
                    : defaultPreferences.fastMode
                }
                models={catalog.models}
                modelContextKey={activeConversationId ?? "new"}
                providerDisabled={
                  catalog.models.find(
                    (item) =>
                      item.id ===
                      (activeConversation?.model ?? defaultPreferences.model)
                  )?.active === false
                }
                modelScope={activeConversationId ? "conversation" : "default"}
                onPreferencesChange={handlePreferencesChange}
                onSubmit={handleComposerSubmit}
              />
            </div>
          </footer>
        </SidebarInset>
      </SidebarProvider>
    </AppShellContext.Provider>
  )
}
