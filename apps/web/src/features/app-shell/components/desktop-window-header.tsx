export function DesktopWindowHeader() {
  if (!window.myBotDesktop) return null

  return (
    <div
      aria-hidden="true"
      data-slot="desktop-window-header"
      className="pointer-events-auto absolute inset-x-0 top-0 z-20 h-9 border-b bg-background [-webkit-app-region:drag]"
    />
  )
}
