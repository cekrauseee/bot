import { useEffect, useRef, useState } from "react"

import { authApi, type User } from "@/features/auth/api"
import { ApiError } from "@/lib/api"

type SessionState =
  | { status: "loading" }
  | { status: "authenticated"; user: User }
  | { status: "unauthenticated" }
  | { status: "error"; retry: () => void }

export function useSession(): SessionState {
  const [session, setSession] = useState<SessionState>({ status: "loading" })
  const [attempt, setAttempt] = useState(0)
  const retrying = useRef(false)

  useEffect(() => {
    let active = true

    void authApi
      .session()
      .then((user) => {
        retrying.current = false
        if (active) setSession({ status: "authenticated", user })
      })
      .catch((error: unknown) => {
        if (!active) return
        retrying.current = false
        if (error instanceof ApiError && error.status === 401) {
          setSession({ status: "unauthenticated" })
        } else {
          setSession({
            status: "error",
            retry: () => {
              if (retrying.current) return
              retrying.current = true
              setSession({ status: "loading" })
              setAttempt((value) => value + 1)
            },
          })
        }
      })

    return () => {
      active = false
    }
  }, [attempt])

  return session
}
