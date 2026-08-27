import { useEffect, useState } from 'react'

import { AuthApiError, authApi, type AuthUser } from '@/features/auth/services/auth-api'

export function useSession() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [isUnauthorized, setIsUnauthorized] = useState(false)

  useEffect(() => {
    let active = true
    authApi
      .getSession()
      .then((session) => {
        if (!active) return
        setUser(session)
        setError('')
      })
      .catch((reason: unknown) => {
        if (!active) return
        const apiError = reason instanceof AuthApiError ? reason : null
        setIsUnauthorized(apiError?.status === 401)
        setError(
          apiError?.status === 401
            ? ''
            : 'We could not load your session. Check your connection and try again.',
        )
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  return { error, isLoading, isUnauthorized, user }
}
