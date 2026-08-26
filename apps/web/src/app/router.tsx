import { createBrowserRouter } from 'react-router'

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
    path: '/login',
    HydrateFallback: RouteFallback,
    lazy: {
      Component: async () =>
        (await import('@/pages/auth/login/page')).LoginPage,
    },
  },
])
