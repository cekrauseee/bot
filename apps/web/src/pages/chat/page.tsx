import { useEffect, useState } from 'react'
import { Outlet, useNavigate, useParams } from 'react-router'

import { Button } from '@/components/motion/button/base'
import { PageEntrance } from '@/components/page-entrance'
import { LoadingTransition } from '@/components/loading-transition'
import type { ButtonState } from '@/components/motion/button/stateful'
import { useSession } from '@/features/auth/hooks/use-session'
import { authApi } from '@/features/auth/services/auth-api'
import { ChatFeature, ChatShellSkeleton, conversationPathForRoute } from '@/features/chat'

export function ChatPage() {
  const navigate = useNavigate()
  const { conversationId, projectId } = useParams()
  const { error, isLoading, isUnauthorized, user } = useSession()
  const [signOutStatus, setSignOutStatus] = useState<Exclude<ButtonState, 'success'>>('idle')

  useEffect(() => {
    if (!isLoading && isUnauthorized) navigate('/sign', { replace: true })
  }, [isLoading, isUnauthorized, navigate])

  if (isLoading) {
    return (
      <LoadingTransition stateKey="loading" className="min-h-svh">
      <ChatShellSkeleton
        variant={conversationId ? 'conversation' : 'new'}
        status="Loading your workspace…"
      />
      </LoadingTransition>
    )
  }
  if (error) {
    return (
      <LoadingTransition stateKey="error" className="min-h-svh">
      <main className="flex min-h-svh flex-col items-center justify-center gap-3 bg-background p-5 text-center">
        <p role="alert" className="text-sm text-destructive">
          Unable to load your session. Check your connection and try again.
        </p>
        <Button onClick={() => window.location.reload()}>Try again</Button>
      </main>
      </LoadingTransition>
    )
  }
  if (!user) {
    return (
      <LoadingTransition stateKey="loading" className="min-h-svh">
      <ChatShellSkeleton
        variant={conversationId ? 'conversation' : 'new'}
        status="Loading your workspace…"
      />
      </LoadingTransition>
    )
  }

  const signOut = async () => {
    setSignOutStatus('loading')
    try {
      await authApi.signOut()
      navigate('/sign', { replace: true, viewTransition: true })
    } catch {
      setSignOutStatus('error')
    }
  }

  return (
    <LoadingTransition stateKey="ready" className="min-h-svh">
    <PageEntrance>
      <ChatFeature
        conversationId={conversationId}
        projectSlug={projectId}
        user={{
          displayName: [user.first_name, user.last_name].filter(Boolean).join(' ') || 'You',
          email: user.email,
          avatarUrl: user.avatar_url ?? undefined,
        }}
        signOutStatus={signOutStatus}
        onSignOut={() => void signOut()}
        onNewTask={() => navigate('/')}
        onConversationStarted={(id) =>
          navigate(conversationPathForRoute(id), { replace: true })}
        onConversationSelect={(id, projectSlug, replace = false) =>
          navigate(conversationPathForRoute(id, projectSlug), { replace })}
        onConversationDelete={(id) => {
          if (id === conversationId) navigate('/', { replace: true })
        }}
      />
      <Outlet />
    </PageEntrance>
    </LoadingTransition>
  )
}
