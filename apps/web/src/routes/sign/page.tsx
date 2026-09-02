import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"

import { Spinner } from "@/components/ui/spinner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { SignInCard } from "@/features/auth/components/sign-in-card"
import { DesktopSignIn } from "@/features/auth/components/desktop-sign-in"
import { SessionError } from "@/features/auth/components/session-error"
import { consumeAuthDestination } from "@/features/auth/session-destination"
import { useSession } from "@/features/auth/hooks/use-session"
import { authApi } from "@/features/auth/api"

export default function SignPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const session = useSession()
  const desktopHandoff = searchParams.get("desktop_transaction")
  const [approval, setApproval] = useState<"idle" | "pending" | "approved" | "error">("idle")

  useEffect(() => {
    if (session.status === "authenticated" && !desktopHandoff) {
      navigate(consumeAuthDestination(), { replace: true })
    }
  }, [desktopHandoff, navigate, session.status])

  if (session.status === "authenticated" && desktopHandoff) {
    const approve = async () => {
      setApproval("pending")
      try {
        await authApi.approveDesktop(desktopHandoff)
        setApproval("approved")
      } catch {
        setApproval("error")
      }
    }
    return (
      <main className="flex min-h-svh items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Approve myBot desktop sign-in</CardTitle>
            <CardDescription>
              Approve this request only if you started it from the myBot desktop app.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button onClick={() => void approve()} disabled={approval === "pending" || approval === "approved"}>
              {approval === "pending" && <Spinner data-icon="inline-start" />}
              {approval === "approved" ? "Approved" : "Approve desktop sign-in"}
            </Button>
            <p className="text-muted-foreground text-sm" role={approval === "error" ? "alert" : "status"} aria-live="polite">
              {approval === "approved"
                ? "Return to the myBot desktop app to continue."
                : approval === "error"
                  ? "This request could not be approved. Return to the desktop app and try again."
                  : "Your browser session stays signed in separately."}
            </p>
          </CardContent>
        </Card>
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
      ) : (
        window.myBotDesktop ? <DesktopSignIn /> : <SignInCard googleError={searchParams.get("error") === "google"} desktopTransaction={desktopHandoff ?? undefined} />
      )}
    </main>
  )
}
