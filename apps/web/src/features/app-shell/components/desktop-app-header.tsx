import { SidebarTrigger } from "@/components/ui/sidebar"

type DesktopAppHeaderProps = {
  title: string
}

export function DesktopAppHeader({ title }: DesktopAppHeaderProps) {
  return (
    <header
      data-slot="desktop-app-header"
      className="absolute inset-x-0 top-0 z-30 flex h-9 min-w-0 shrink-0 items-center border-b bg-background ps-[5.25rem] pe-3 [-webkit-app-region:drag]"
    >
      <SidebarTrigger
        aria-label="Toggle sidebar"
        className="me-3 [-webkit-app-region:no-drag]"
      />
      <h1
        id="conversation-title"
        className="min-w-0 truncate text-sm leading-5 font-semibold"
        title={title}
      >
        {title}
      </h1>
    </header>
  )
}
