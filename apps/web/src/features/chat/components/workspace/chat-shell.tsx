import { useEffect, useRef } from 'react'

import {
  AnimatedSidebarProvider,
  type AnimatedSidebarProviderProps,
} from '@/components/motion/animated-sidebar'
import { useAnimatedSidebar } from '@/components/motion/animated-sidebar-context'
import { cn } from '@/lib/utils'

const MIN_DOCKED_WIDTH = 600

function ShellFit({ minWidth }: { minWidth: number }) {
  const { open, setOpen } = useAnimatedSidebar()
  const markerRef = useRef<HTMLDivElement>(null)
  const narrowRef = useRef<boolean | null>(null)
  const openRef = useRef(open)

  useEffect(() => {
    openRef.current = open
  }, [open])

  useEffect(() => {
    const shell = markerRef.current?.parentElement
    if (!shell) return

    const observer = new ResizeObserver(([entry]) => {
      const narrow = entry.contentRect.width < minWidth
      if (narrowRef.current === narrow) return
      const first = narrowRef.current === null
      narrowRef.current = narrow
      if (first && !narrow) return

      const wanted = !narrow
      if (openRef.current === wanted) return
      setOpen(wanted)
    })

    observer.observe(shell)
    return () => observer.disconnect()
  }, [minWidth, setOpen])

  return <div ref={markerRef} className="hidden" />
}

export interface ChatShellProps extends AnimatedSidebarProviderProps {
  sidebarWidth?: string
  collapseSidebarBelow?: number
}

export function ChatShell({
  children,
  className,
  sidebarWidth = '17rem',
  collapseSidebarBelow = MIN_DOCKED_WIDTH,
  style,
  ...props
}: ChatShellProps) {
  return (
    <AnimatedSidebarProvider
      {...props}
      style={{ ...style, '--sidebar-width': sidebarWidth }}
      className={cn(
        'min-h-0 w-full overflow-hidden rounded-2xl border border-border bg-background',
        className,
      )}
    >
      {props.open === undefined ? <ShellFit minWidth={collapseSidebarBelow} /> : null}
      {children}
    </AnimatedSidebarProvider>
  )
}
