import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'

import { type ButtonState } from '@/components/motion/button/stateful'
import { Button } from '@/components/motion/button/base'
import { useSession } from '@/features/auth/hooks/use-session'
import { authApi } from '@/features/auth/services/auth-api'
import { ChatFeature } from '@/features/chat'

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
    <ChatFeature
      user={{
        displayName: [user.first_name, user.last_name].filter(Boolean).join(' ') || 'You',
        email: user.email,
        avatarUrl: user.avatar_url ?? undefined,
      }}
      signOutError={signOutError}
      signOutStatus={signOutStatus}
      onSignOut={() => void signOut()}
    />
  )
}
