import { Suspense } from "react"
import { Outlet } from "react-router-dom"

import { ThemeProvider } from "@/components/theme-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { RouteLoading } from "@/routes/loading"

export function RootRouteLayout() {
  return (
    <ThemeProvider>
      <TooltipProvider>
        <Suspense fallback={<RouteLoading />}>
          <Outlet />
        </Suspense>
      </TooltipProvider>
    </ThemeProvider>
  )
}
