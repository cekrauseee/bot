import { matchPath, useLocation } from 'react-router'

import { ChatShellSkeleton } from '@/features/chat/components/loading/chat-shell-skeleton'

export function ChatRouteFallback() {
  const { pathname } = useLocation()
  const conversation = Boolean(
    matchPath('/conversations/:conversationId', pathname) ||
    matchPath('/projects/:projectId/:conversationId', pathname),
  )

  return (
    <ChatShellSkeleton
      variant={conversation ? 'conversation' : 'new'}
      status="Loading your workspace…"
    />
  )
}
