import { lazy } from "react"
import { BrowserRouter, Route, Routes } from "react-router-dom"

import { AuthenticatedRouteLayout } from "@/routes/_authenticated/layout"
import { RootRouteLayout } from "@/routes/layout"

const HomePage = lazy(() => import("@/routes/page"))
const ConversationPage = lazy(
  () => import("@/routes/conversations/[conversationId]/page")
)
const LoginPage = lazy(() => import("@/routes/login/page"))
const NotFoundPage = lazy(() => import("@/routes/not-found"))
const SignPage = lazy(() => import("@/routes/sign/page"))

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootRouteLayout />}>
          <Route element={<AuthenticatedRouteLayout />}>
            <Route index element={<HomePage />} />
            <Route
              path="conversations/:conversationId"
              element={<ConversationPage />}
            />
          </Route>
          <Route path="sign" element={<SignPage />} />
          <Route path="login" element={<LoginPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
