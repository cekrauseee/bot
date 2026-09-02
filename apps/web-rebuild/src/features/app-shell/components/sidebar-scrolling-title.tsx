import { useEffect, useRef, useState, type CSSProperties } from "react"

import { cn } from "@/lib/utils"

export function SidebarScrollingTitle({ title }: { title: string }) {
  const viewportRef = useRef<HTMLSpanElement>(null)
  const measureRef = useRef<HTMLSpanElement>(null)
  const [distance, setDistance] = useState(0)

  useEffect(() => {
    const viewport = viewportRef.current
    const measure = measureRef.current
    if (!viewport || !measure) return

    const update = () => {
      const titleWidth = measure.scrollWidth
      setDistance(titleWidth > viewport.clientWidth ? titleWidth + 24 : 0)
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(viewport)
    observer.observe(measure)
    return () => observer.disconnect()
  }, [title])

  const scrolling = distance > 0

  return (
    <span
      ref={viewportRef}
      className="relative min-w-0 flex-1 overflow-hidden text-left"
    >
      <span
        ref={measureRef}
        aria-hidden="true"
        className="pointer-events-none absolute w-max whitespace-nowrap opacity-0"
      >
        {title}
      </span>
      <span
        className={cn(
          "block min-w-0 truncate",
          scrolling && "sidebar-title-static"
        )}
      >
        {title}
      </span>
      {scrolling && (
        <span
          aria-hidden="true"
          style={{
            "--sidebar-title-distance": `${distance}px`,
            "--sidebar-title-duration": `${Math.max(2.4, distance / 34)}s`,
          } as CSSProperties}
          className="sidebar-title-marquee pointer-events-none invisible absolute inset-y-0 start-0 flex w-max items-center gap-6 whitespace-nowrap opacity-0"
        >
          <span>{title}</span>
          <span>{title}</span>
        </span>
      )}
    </span>
  )
}
