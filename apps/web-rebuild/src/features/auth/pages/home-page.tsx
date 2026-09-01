import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"

import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Spinner } from "@/components/ui/spinner"
import { AppSidebar } from "@/features/app-shell/components/app-sidebar"
import { useSidebarCatalog } from "@/features/app-shell/hooks/use-sidebar-catalog"
import { authApi, type User } from "@/features/auth/api"

export function Component() {
  const navigate = useNavigate()
  const [user, setUser] = useState<User | null>(null)
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null)
  const [signingOut, setSigningOut] = useState(false)
  const [signOutFailed, setSignOutFailed] = useState(false)
  const catalog = useSidebarCatalog(user !== null)
  const activeConversation = catalog.conversations.find(
    (conversation) => conversation.id === activeConversationId
  )
  const resolvedActiveConversationId = activeConversation?.id ?? null

  useEffect(() => {
    let active = true
    void authApi
      .session()
      .then((sessionUser) => {
        if (active) setUser(sessionUser)
      })
      .catch(() => {
        if (active) navigate("/sign", { replace: true })
      })
    return () => {
      active = false
    }
  }, [navigate])

  const handleSignOut = async () => {
    setSigningOut(true)
    setSignOutFailed(false)
    try {
      await authApi.signOut()
      navigate("/sign", { replace: true })
    } catch {
      setSigningOut(false)
      setSignOutFailed(true)
    }
  }

  return (
    <>
      {user ? (
        <SidebarProvider>
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:shadow-md"
          >
            Skip to content
          </a>
          <AppSidebar
            user={user}
            catalog={catalog}
            activeConversationId={resolvedActiveConversationId}
            onConversationSelect={setActiveConversationId}
            onSignOut={() => void handleSignOut()}
            signingOut={signingOut}
            signOutFailed={signOutFailed}
          />
          <SidebarInset>
            <header className="flex h-12 items-center border-b px-3 md:hidden">
              <SidebarTrigger aria-label="Open sidebar" />
            </header>
            <main
              id="main-content"
              className="flex min-h-0 flex-1 items-center justify-center p-6"
            >
              <div className="max-w-sm text-center">
                <h1 className="text-base font-medium">
                  {activeConversation?.title ?? "New conversation"}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Conversation content will appear here.
                </p>
              </div>
            </main>
          </SidebarInset>
        </SidebarProvider>
      ) : (
        <main className="flex min-h-svh items-center justify-center p-4">
          <Spinner aria-label="Loading application" />
        </main>
      )}
    </>
  )
}
