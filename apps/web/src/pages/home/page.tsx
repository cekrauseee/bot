import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'

import { Button } from '@/components/motion/button/base'
import { StatefulButton, type ButtonState } from '@/components/motion/button/stateful'
import { useSession } from '@/features/auth/hooks/use-session'
import { authApi } from '@/features/auth/services/auth-api'
import { cn } from '@/lib/utils'

export function HomePage() {
  const navigate = useNavigate()
  const { error, isLoading, isUnauthorized, user } = useSession()
  const [signOutStatus, setSignOutStatus] = useState<ButtonState>('idle')
  const [signOutError, setSignOutError] = useState('')

  useEffect(() => {
    if (!isLoading && isUnauthorized) navigate('/sign', { replace: true })
  }, [isLoading, isUnauthorized, navigate])

  if (isLoading) {
    return <main className="min-h-svh bg-background" aria-busy="true" />
  }

  if (error) {
    return (
      <main className="flex min-h-svh flex-col items-center justify-center gap-3 bg-background p-5 text-center">
        <p role="alert" className="text-sm text-destructive">{error}</p>
        <Button onClick={() => window.location.reload()}>Try again</Button>
      </main>
    )
  }

  if (!user) return <main className="min-h-svh bg-background" aria-busy="true" />

  const signOut = async () => {
    setSignOutStatus('loading')
    setSignOutError('')
    try {
      await authApi.signOut()
      setSignOutStatus('success')
      navigate('/sign', { replace: true })
    } catch {
      setSignOutStatus('error')
      setSignOutError('We could not sign you out. Try again.')
    }
  }

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-3 bg-background p-5">
      <StatefulButton
        errorText="Try again"
        loadingText="Signing out…"
        pressScale={0.96}
        state={signOutStatus}
        successText="Signed out"
        onClick={() => void signOut()}
      >
        Sign out
      </StatefulButton>
      <p
        aria-live="polite"
        className={cn('text-sm', signOutError && 'text-destructive')}
        role="status"
      >
        {signOutError}
      </p>
    </main>
  )
}
