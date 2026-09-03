import { Suspense } from "react"
import { Outlet } from "react-router-dom"

import { ThemeProvider } from "@/components/theme-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { DesktopWindowHeader } from "@/features/app-shell/components/desktop-window-header"
import { RouteLoading } from "@/routes/loading"

export function RootRouteLayout() {
  return (
    <ThemeProvider>
      <TooltipProvider>
        <div className="relative min-h-svh">
          <DesktopWindowHeader />
          <Suspense fallback={<RouteLoading />}>
            <Outlet />
          </Suspense>
        </div>
      </TooltipProvider>
    </ThemeProvider>
  )
}
