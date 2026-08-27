import { createBrowserRouter, Navigate } from 'react-router'

import { RouteFallback } from '@/app/components/route-fallback'

export const router = createBrowserRouter([
  {
    path: '/',
    HydrateFallback: RouteFallback,
    lazy: {
      Component: async () =>
        (await import('@/pages/home/page')).HomePage,
    },
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
