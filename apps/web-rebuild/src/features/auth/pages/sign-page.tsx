import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"

import { Spinner } from "@/components/ui/spinner"
import { authApi } from "@/features/auth/api"
import { SignInCard } from "@/features/auth/components/sign-in-card"

export function Component() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [checkingSession, setCheckingSession] = useState(true)

  useEffect(() => {
    let active = true
    void authApi
      .session()
      .then(() => {
        if (active) navigate("/", { replace: true })
      })
      .catch(() => {
        if (active) setCheckingSession(false)
      })
    return () => {
      active = false
    }
  }, [navigate])

  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      {checkingSession ? (
        <Spinner />
      ) : (
        <SignInCard googleError={searchParams.get("error") === "google"} />
      )}
    </main>
  )
}
