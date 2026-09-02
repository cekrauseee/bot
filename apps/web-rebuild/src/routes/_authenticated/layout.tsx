import { useEffect } from "react"
import {
  Navigate,
  Outlet,
  useLocation,
  useMatch,
  useNavigate,
} from "react-router-dom"

import { AuthenticatedAppShell } from "@/features/app-shell/components/authenticated-app-shell"
import { useSession } from "@/features/auth/hooks/use-session"
import { SessionError } from "@/features/auth/components/session-error"
import {
  consumeAuthDestination,
  rememberAuthDestination,
} from "@/features/auth/session-destination"
import { RouteLoading } from "@/routes/loading"

export function AuthenticatedRouteLayout() {
  const navigate = useNavigate()
  const conversationMatch = useMatch("/conversations/:conversationId")
  const location = useLocation()
  const session = useSession()

  useEffect(() => {
    if (session.status === "authenticated" && location.pathname === "/") {
      const destination = consumeAuthDestination()
      if (destination !== "/") navigate(destination, { replace: true })
      return
    }

    if (session.status === "unauthenticated") {
      rememberAuthDestination(location.pathname, location.search)
    }
  }, [location.pathname, location.search, navigate, session.status])

  if (session.status === "loading") {
    return <RouteLoading />
  }

  if (session.status === "error") {
    return <SessionError onRetry={session.retry} />
  }

  if (session.status === "unauthenticated") {
    return <Navigate to="/sign" replace />
  }

  return (
    <AuthenticatedAppShell
      user={session.user}
      activeConversationId={conversationMatch?.params.conversationId ?? null}
      onConversationSelect={(conversationId) =>
        navigate(conversationId ? `/conversations/${conversationId}` : "/")
      }
      onSignedOut={() => navigate("/sign", { replace: true })}
    >
      <Outlet />
    </AuthenticatedAppShell>
  )
}
