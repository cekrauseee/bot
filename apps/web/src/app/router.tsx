import { createBrowserRouter, Navigate } from 'react-router'

import { ChatRouteFallback } from '@/app/components/chat-route-fallback'
import { RouteFallback } from '@/app/components/route-fallback'

export const router = createBrowserRouter([
  {
    path: '/',
    HydrateFallback: ChatRouteFallback,
    lazy: {
      Component: async () => (await import('@/pages/chat/page')).ChatPage,
    },
    children: [
      { index: true, Component: () => null },
      { path: 'conversations/:conversationId', Component: () => null },
      { path: 'projects/:projectId/:conversationId', Component: () => null },
    ],
  },
  {
    path: '/sign',
    HydrateFallback: RouteFallback,
    lazy: {
      Component: async () =>
        (await import('@/pages/auth/login/page')).LoginPage,
    },
  },
  {
    path: '/login',
    Component: () => <Navigate to="/sign" replace />,
  },
])
