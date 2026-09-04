import { useEffect } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"

import { Spinner } from "@/components/ui/spinner"
import { DesktopBrowserHandoff } from "@/features/auth/components/desktop-browser-handoff"
import { SignInCard } from "@/features/auth/components/sign-in-card"
import { DesktopSignIn } from "@/features/auth/components/desktop-sign-in"
import { SessionError } from "@/features/auth/components/session-error"
import { consumeAuthDestination } from "@/features/auth/session-destination"
import { useSession } from "@/features/auth/hooks/use-session"

export default function SignPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const session = useSession()
  const desktopHandoff = searchParams.get("desktop_transaction")

  useEffect(() => {
    if (session.status === "authenticated" && !desktopHandoff) {
      navigate(consumeAuthDestination(), { replace: true })
    }
  }, [desktopHandoff, navigate, session.status])

  if (session.status === "authenticated" && desktopHandoff) {
    return (
      <main className="flex min-h-svh items-center justify-center p-4">
        <DesktopBrowserHandoff transactionId={desktopHandoff} />
      </main>
    )
  }

  if (session.status === "authenticated") {
    return null
  }

  if (session.status === "error") {
    return <SessionError onRetry={session.retry} />
  }

  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      {session.status === "loading" ? (
        <Spinner aria-label="Checking session" />
      ) : window.myBotDesktop ? (
        <DesktopSignIn />
      ) : (
        <SignInCard
          googleError={searchParams.get("error") === "google"}
          desktopTransaction={desktopHandoff ?? undefined}
        />
      )}
    </main>
  )
}
