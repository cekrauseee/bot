import { useEffect, useState } from 'react'
import { Outlet, useNavigate, useParams } from 'react-router'

import { Button } from '@/components/motion/button/base'
import type { ButtonState } from '@/components/motion/button/stateful'
import { useSession } from '@/features/auth/hooks/use-session'
import { authApi } from '@/features/auth/services/auth-api'
import { ChatFeature } from '@/features/chat'

export function ChatPage() {
  const navigate = useNavigate()
  const { conversationId, projectId } = useParams()
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
        <p role="alert" className="text-sm text-destructive">
          Unable to load your session. Check your connection and try again.
        </p>
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
      setSignOutError('Unable to sign out. Check your connection and try again.')
    }
  }

  return (
    <>
      <ChatFeature
        conversationId={conversationId}
        projectSlug={projectId}
        user={{
          displayName: [user.first_name, user.last_name].filter(Boolean).join(' ') || 'You',
          email: user.email,
          avatarUrl: user.avatar_url ?? undefined,
        }}
        signOutError={signOutError}
        signOutStatus={signOutStatus}
        onSignOut={() => void signOut()}
        onNewTask={() => navigate('/')}
        onConversationStarted={(id) =>
          navigate(`/conversations/${id}`, { replace: true })}
        onConversationSelect={(id, projectSlug, replace = false) => navigate(
          projectSlug
            ? `/projects/${encodeURIComponent(projectSlug)}/${id}`
            : `/conversations/${id}`,
          { replace },
        )}
        onConversationDelete={(id) => {
          if (id === conversationId) navigate('/', { replace: true })
        }}
      />
      <Outlet />
    </>
  )
}
