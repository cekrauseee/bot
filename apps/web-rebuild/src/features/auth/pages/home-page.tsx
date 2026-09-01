import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { authApi } from "@/features/auth/api"

export function Component() {
  const navigate = useNavigate()
  const [ready, setReady] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [signOutFailed, setSignOutFailed] = useState(false)

  useEffect(() => {
    let active = true
    void authApi
      .session()
      .then(() => {
        if (active) setReady(true)
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
    <main className="flex min-h-svh items-center justify-center p-4">
      {ready ? (
        <Button
          type="button"
          onClick={() => void handleSignOut()}
          disabled={signingOut}
        >
          {signingOut && <Spinner data-icon="inline-start" />}
          {signOutFailed ? "Try signing out again" : "Sign out"}
        </Button>
      ) : (
        <Spinner />
      )}
    </main>
  )
}
