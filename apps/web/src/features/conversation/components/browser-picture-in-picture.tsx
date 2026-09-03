import { useCallback, useLayoutEffect, useRef, useState } from "react"
import type { KeyboardEvent, PointerEvent, RefObject } from "react"
import { Globe2Icon } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  clampBrowserPictureInPicturePosition,
  DEFAULT_BROWSER_PICTURE_IN_PICTURE_CORNER,
  getBrowserPictureInPictureBounds,
  getBrowserPictureInPictureCoordinates,
  getBrowserPictureInPictureCornerForArrow,
  getBrowserPictureInPicturePositionForPointer,
  getNearestBrowserPictureInPictureCorner,
  type BrowserPictureInPictureBounds,
  type BrowserPictureInPictureCorner,
  type BrowserPictureInPicturePosition,
} from "@/features/conversation/components/browser-picture-in-picture-position"
import type {
  BrowserFrame,
  BrowserProjection,
} from "@/features/conversation/model"
import { cn } from "@/lib/utils"

const DEFAULT_COMPOSER_DOCK_HEIGHT = 64
const VIEWPORT_INSET = 16
const WIDE_VIEWPORT_INSET = 24
const WIDE_VIEWPORT_QUERY = "(min-width: 640px)"

type Geometry = {
  bounds: BrowserPictureInPictureBounds
  cardRect: DOMRect
  containerOrigin: BrowserPictureInPicturePosition
}

type DragSession = {
  grabOffset: BrowserPictureInPicturePosition
  lastGeometry: Geometry
  lastPointer: BrowserPictureInPicturePosition
  pointerId: number
}

type Placement = {
  animate: boolean
  corner: BrowserPictureInPictureCorner
  dragging: boolean
  position: BrowserPictureInPicturePosition | null
}

function getComposerDockHeight(element: HTMLElement) {
  const value = Number.parseFloat(
    window.getComputedStyle(element).getPropertyValue("--composer-dock-height")
  )

  return Number.isFinite(value) && value >= 0
    ? value
    : DEFAULT_COMPOSER_DOCK_HEIGHT
}

function getHorizontalInset() {
  return window.matchMedia(WIDE_VIEWPORT_QUERY).matches
    ? WIDE_VIEWPORT_INSET
    : VIEWPORT_INSET
}

export function BrowserPictureInPicture({
  containerRef,
  frame,
  projection,
}: {
  containerRef: RefObject<HTMLElement | null>
  frame?: BrowserFrame
  projection?: BrowserProjection | null
}) {
  const active = Boolean(
    projection &&
    ["launching", "live", "awaiting_user"].includes(projection.state)
  )
  const [placement, setPlacement] = useState<Placement>({
    animate: false,
    corner: DEFAULT_BROWSER_PICTURE_IN_PICTURE_CORNER,
    dragging: false,
    position: null,
  })
  const cardRef = useRef<HTMLDivElement>(null)
  const dragSessionRef = useRef<DragSession | null>(null)
  const placementRef = useRef(placement)

  const commitPlacement = useCallback((next: Placement) => {
    placementRef.current = next
    setPlacement(next)
  }, [])

  const readGeometry = useCallback((): Geometry | null => {
    const card = cardRef.current
    const container = containerRef.current
    if (!card || !container) return null

    const cardRect = card.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()
    const horizontal = getHorizontalInset()

    return {
      bounds: getBrowserPictureInPictureBounds(
        { height: cardRect.height, width: cardRect.width },
        { height: containerRect.height, width: containerRect.width },
        {
          bottom: getComposerDockHeight(card) + VIEWPORT_INSET,
          horizontal,
          top: VIEWPORT_INSET,
        }
      ),
      cardRect,
      containerOrigin: { x: containerRect.left, y: containerRect.top },
    }
  }, [containerRef])

  const placeAtCorner = useCallback(
    (
      corner: BrowserPictureInPictureCorner,
      geometry: Geometry,
      animate: boolean
    ) => {
      const card = cardRef.current
      if (!card) return

      commitPlacement({
        animate,
        corner,
        dragging: false,
        position: getBrowserPictureInPictureCoordinates(
          corner,
          geometry.bounds,
          window.getComputedStyle(card).direction === "rtl"
        ),
      })
    },
    [commitPlacement]
  )

  useLayoutEffect(() => {
    if (!active) {
      dragSessionRef.current = null
      return
    }

    const synchronizePosition = () => {
      const geometry = readGeometry()
      if (!geometry) return

      const session = dragSessionRef.current
      if (session) {
        const position = getBrowserPictureInPicturePositionForPointer(
          session.lastPointer,
          geometry.containerOrigin,
          session.grabOffset,
          geometry.bounds
        )
        session.lastGeometry = geometry
        commitPlacement({
          ...placementRef.current,
          animate: false,
          dragging: true,
          position,
        })
        return
      }

      placeAtCorner(placementRef.current.corner, geometry, false)
    }

    synchronizePosition()

    const container = containerRef.current
    const card = cardRef.current
    const resizeObserver = new ResizeObserver(synchronizePosition)
    if (container) resizeObserver.observe(container)
    if (card) resizeObserver.observe(card)

    const styleOwner = container?.parentElement
    const styleObserver = styleOwner
      ? new MutationObserver(synchronizePosition)
      : null
    if (styleOwner && styleObserver) {
      styleObserver.observe(styleOwner, {
        attributeFilter: ["style"],
        attributes: true,
      })
    }

    const mediaQuery = window.matchMedia(WIDE_VIEWPORT_QUERY)
    mediaQuery.addEventListener("change", synchronizePosition)
    window.addEventListener("resize", synchronizePosition)

    return () => {
      resizeObserver.disconnect()
      styleObserver?.disconnect()
      mediaQuery.removeEventListener("change", synchronizePosition)
      window.removeEventListener("resize", synchronizePosition)
      dragSessionRef.current = null
    }
  }, [active, commitPlacement, containerRef, placeAtCorner, readGeometry])

  if (!active || !projection) return null

  const label =
    projection.state === "awaiting_user"
      ? "Browser needs your input"
      : projection.state === "launching"
        ? "Opening browser"
        : "Working in the browser"

  const beginDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (
      dragSessionRef.current ||
      !event.isPrimary ||
      (event.pointerType === "mouse" && event.button !== 0)
    )
      return

    const geometry = readGeometry()
    if (!geometry) return

    const currentPosition = clampBrowserPictureInPicturePosition(
      {
        x: geometry.cardRect.left - geometry.containerOrigin.x,
        y: geometry.cardRect.top - geometry.containerOrigin.y,
      },
      geometry.bounds
    )
    const pointer = { x: event.clientX, y: event.clientY }

    dragSessionRef.current = {
      grabOffset: {
        x: event.clientX - geometry.cardRect.left,
        y: event.clientY - geometry.cardRect.top,
      },
      lastGeometry: geometry,
      lastPointer: pointer,
      pointerId: event.pointerId,
    }
    commitPlacement({
      ...placementRef.current,
      animate: false,
      dragging: true,
      position: currentPosition,
    })
    event.currentTarget.focus({ preventScroll: true })
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    const session = dragSessionRef.current
    if (!session || session.pointerId !== event.pointerId) return

    const geometry = readGeometry() ?? session.lastGeometry
    const pointer = { x: event.clientX, y: event.clientY }
    const position = getBrowserPictureInPicturePositionForPointer(
      pointer,
      geometry.containerOrigin,
      session.grabOffset,
      geometry.bounds
    )

    session.lastGeometry = geometry
    session.lastPointer = pointer
    commitPlacement({
      ...placementRef.current,
      animate: false,
      dragging: true,
      position,
    })
  }

  const finishDrag = (
    event: PointerEvent<HTMLDivElement>,
    useEventPosition: boolean
  ) => {
    const session = dragSessionRef.current
    if (!session || session.pointerId !== event.pointerId) return

    const geometry = readGeometry() ?? session.lastGeometry
    const pointer = useEventPosition
      ? { x: event.clientX, y: event.clientY }
      : session.lastPointer
    const position = getBrowserPictureInPicturePositionForPointer(
      pointer,
      geometry.containerOrigin,
      session.grabOffset,
      geometry.bounds
    )
    const rightToLeft =
      window.getComputedStyle(event.currentTarget).direction === "rtl"
    const corner = getNearestBrowserPictureInPictureCorner(
      position,
      geometry.bounds,
      rightToLeft
    )

    dragSessionRef.current = null
    placeAtCorner(corner, geometry, true)

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const moveToArrowCorner = (event: KeyboardEvent<HTMLDivElement>) => {
    if (dragSessionRef.current) return

    const nextCorner = getBrowserPictureInPictureCornerForArrow(
      placementRef.current.corner,
      event.key,
      window.getComputedStyle(event.currentTarget).direction === "rtl"
    )
    if (!nextCorner) return

    const geometry = readGeometry()
    if (!geometry) return

    event.preventDefault()
    placeAtCorner(nextCorner, geometry, true)
  }

  return (
    <aside
      aria-label="Browser preview"
      aria-busy={!frame}
      className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
    >
      <div
        ref={cardRef}
        data-position={placement.corner}
        role="group"
        tabIndex={0}
        aria-label={`${label}. Drag to reposition, or use arrow keys to move between corners.`}
        onKeyDown={moveToArrowCorner}
        onLostPointerCapture={(event) => finishDrag(event, false)}
        onPointerCancel={(event) => finishDrag(event, false)}
        onPointerDown={beginDrag}
        onPointerMove={moveDrag}
        onPointerUp={(event) => finishDrag(event, true)}
        className={cn(
          "pointer-events-auto absolute top-0 left-0 w-[calc(100%_-_2rem)] max-w-sm cursor-grab touch-none outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:cursor-grabbing sm:w-[calc(100%_-_3rem)]",
          placement.dragging
            ? "cursor-grabbing transition-none will-change-transform"
            : placement.animate &&
                "motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out"
        )}
        style={{
          transform: `translate3d(${placement.position?.x ?? 0}px, ${placement.position?.y ?? 0}px, 0)`,
          visibility: placement.position ? "visible" : "hidden",
        }}
      >
        <Card className="h-full w-full gap-2 py-3 shadow-lg">
          <CardHeader className="flex flex-row items-center gap-2 py-0">
            <Globe2Icon
              aria-hidden="true"
              className="size-4 text-muted-foreground"
            />
            <CardTitle className="min-w-0 truncate text-sm">{label}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {frame ? (
              <img
                src={`data:${frame.mimeType};base64,${frame.base64}`}
                alt="Current browser page"
                draggable={false}
                className="aspect-video w-full rounded-lg object-contain outline outline-1 outline-black/10 dark:outline-white/10"
              />
            ) : (
              <Skeleton
                aria-hidden="true"
                className="aspect-video w-full rounded-lg motion-reduce:animate-none"
              />
            )}
          </CardContent>
        </Card>
      </div>
    </aside>
  )
}
