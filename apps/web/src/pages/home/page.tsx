import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'

import { Button } from '@/components/motion/button/base'
import { useSession } from '@/features/auth/hooks/use-session'
import { authApi } from '@/features/auth/services/auth-api'
import { cn } from '@/lib/utils'

export function HomePage() {
  const navigate = useNavigate()
  const { error, isLoading, isUnauthorized, user } = useSession()
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState('')

  useEffect(() => {
    if (!isLoading && isUnauthorized) navigate('/login', { replace: true })
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
    setIsSigningOut(true)
    setSignOutError('')
    try {
      await authApi.signOut()
      navigate('/login', { replace: true })
    } catch {
      setSignOutError('We could not sign you out. Try again.')
    } finally {
      setIsSigningOut(false)
    }
  }

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-3 bg-background p-5">
      <Button disabled={isSigningOut} onClick={() => void signOut()}>
        {isSigningOut ? 'Signing out…' : 'Sign out'}
      </Button>
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
