import { useCallback, useLayoutEffect, useRef } from "react"

import {
  calculateTurnScrollTop,
  calculateTurnSpacerCorrection,
  calculateTurnSpacerHeight,
} from "@/features/conversation/turn-spacer"

const spacerSelector = "[data-message-scroller-spacer]"
const turnAnchorLift = 16

function pixels(value: string) {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function contentSpacing(content: HTMLElement) {
  const style = window.getComputedStyle(content)
  return {
    blockEnd: pixels(style.paddingBlockEnd || style.paddingBottom),
    blockStart: pixels(style.paddingBlockStart || style.paddingTop),
    rowGap: pixels(style.rowGap === "normal" ? style.gap : style.rowGap),
  }
}

function findSpacer(content: HTMLElement) {
  return content.querySelector<HTMLElement>(spacerSelector)
}

function findMessage(content: HTMLElement, messageId: string) {
  return Array.from(
    content.querySelectorAll<HTMLElement>("[data-message-id]")
  ).find((element) => element.dataset.messageId === messageId)
}

function lastMessage(content: HTMLElement) {
  return Array.from(
    content.querySelectorAll<HTMLElement>("[data-message-id]")
  ).at(-1)
}

export function useTurnSpacer(
  anchorId?: string,
  onAnchorConsumed?: (anchorId: string) => void
) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef(false)
  const anchorIdRef = useRef<string | undefined>(undefined)
  const anchorFrameRef = useRef<number | null>(null)
  const lastScrollTopRef = useRef(0)
  const positioningAnchorRef = useRef(false)
  const spacerHeightRef = useRef(0)
  const targetScrollTopRef = useRef(0)

  const setSpacerHeight = useCallback((height: number) => {
    const content = contentRef.current
    const spacer = content ? findSpacer(content) : null
    if (!content || !spacer) return

    const nextHeight = Math.max(0, Math.ceil(height))
    if (nextHeight === spacerHeightRef.current && !spacer.hidden) return

    spacerHeightRef.current = nextHeight
    spacer.hidden = nextHeight === 0
    spacer.style.height = `${nextHeight}px`
    spacer.style.marginTop =
      nextHeight > 0 ? `${-contentSpacing(content).rowGap}px` : ""
  }, [])

  const clearSpacer = useCallback(() => {
    activeRef.current = false
    setSpacerHeight(0)
  }, [setSpacerHeight])

  const syncSpacerHeight = useCallback(() => {
    const content = contentRef.current
    const viewport = viewportRef.current
    const finalMessage = content ? lastMessage(content) : null
    if (!activeRef.current || !content || !viewport || !finalMessage) return

    const viewportRect = viewport.getBoundingClientRect()
    const spacing = contentSpacing(content)
    const naturalContentEnd =
      finalMessage.getBoundingClientRect().bottom -
      viewportRect.top +
      viewport.scrollTop +
      spacing.blockEnd

    const height = calculateTurnSpacerHeight({
      naturalContentEnd,
      scrollTop: targetScrollTopRef.current,
      viewportHeight: viewport.clientHeight,
    })
    setSpacerHeight(height)
    const correction = calculateTurnSpacerCorrection(
      targetScrollTopRef.current,
      viewport.scrollHeight - viewport.clientHeight
    )
    const correctedHeight = height + correction
    if (correction > 0) setSpacerHeight(correctedHeight)
    if (correctedHeight === 0) activeRef.current = false

    // Reducing the spacer can momentarily lower the maximum scroll position.
    // Restore the anchor after the final height is applied so streamed content
    // cannot make the active user message drift away from the top inset.
    viewport.scrollTo({
      top: targetScrollTopRef.current,
      behavior: "auto",
    })
    lastScrollTopRef.current = viewport.scrollTop
  }, [setSpacerHeight])

  useLayoutEffect(() => {
    const content = contentRef.current
    const viewport = viewportRef.current
    if (!anchorId) {
      if (viewport) lastScrollTopRef.current = viewport.scrollTop
      return
    }
    if (!content || !viewport || anchorIdRef.current === anchorId) return

    const anchor = findMessage(content, anchorId)
    if (!anchor) return

    anchorIdRef.current = anchorId
    activeRef.current = true
    positioningAnchorRef.current = true
    if (anchorFrameRef.current !== null) {
      window.cancelAnimationFrame(anchorFrameRef.current)
      anchorFrameRef.current = null
    }
    setSpacerHeight(0)

    const viewportRect = viewport.getBoundingClientRect()
    const anchorTop =
      anchor.getBoundingClientRect().top - viewportRect.top + viewport.scrollTop
    const targetScrollTop = calculateTurnScrollTop(
      anchorTop,
      contentSpacing(content).blockStart,
      turnAnchorLift
    )

    targetScrollTopRef.current = targetScrollTop
    syncSpacerHeight()
    viewport.scrollTo({ top: targetScrollTop, behavior: "auto" })
    lastScrollTopRef.current = viewport.scrollTop

    anchorFrameRef.current = window.requestAnimationFrame(() => {
      anchorFrameRef.current = null
      syncSpacerHeight()
      viewport.scrollTo({ top: targetScrollTop, behavior: "auto" })
      lastScrollTopRef.current = viewport.scrollTop
      positioningAnchorRef.current = false
      onAnchorConsumed?.(anchorId)
    })

    return () => {
      if (anchorFrameRef.current !== null) {
        window.cancelAnimationFrame(anchorFrameRef.current)
        anchorFrameRef.current = null
      }
      positioningAnchorRef.current = false
    }
  }, [
    anchorId,
    clearSpacer,
    onAnchorConsumed,
    setSpacerHeight,
    syncSpacerHeight,
  ])

  useLayoutEffect(() => {
    const content = contentRef.current
    const viewport = viewportRef.current
    if (!content || !viewport || typeof ResizeObserver === "undefined") return

    const observer = new ResizeObserver(syncSpacerHeight)
    observer.observe(content)
    observer.observe(viewport)

    return () => observer.disconnect()
  }, [syncSpacerHeight])

  const handleScroll = useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const scrollTop = viewport.scrollTop
    if (positioningAnchorRef.current) {
      lastScrollTopRef.current = scrollTop
      return
    }
    if (
      activeRef.current &&
      spacerHeightRef.current > 0 &&
      scrollTop < lastScrollTopRef.current
    ) {
      targetScrollTopRef.current = scrollTop
      syncSpacerHeight()
    }
    lastScrollTopRef.current = scrollTop
  }, [syncSpacerHeight])

  return {
    clearSpacer,
    contentRef,
    handleScroll,
    viewportRef,
  }
}
