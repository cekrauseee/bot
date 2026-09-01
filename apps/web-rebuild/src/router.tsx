import { createBrowserRouter, redirect } from "react-router-dom"

export const router = createBrowserRouter([
  { path: "/", lazy: () => import("@/features/auth/pages/home-page") },
  { path: "/sign", lazy: () => import("@/features/auth/pages/sign-page") },
  {
    path: "/login",
    loader: ({ request }) => {
      const url = new URL(request.url)
      return redirect(`/sign${url.search}`)
    },
  },
  { path: "*", loader: () => redirect("/") },
])
