import { useCallback, useEffect, useRef, useState } from "react"

import {
  splitStreamingDelta,
  STREAMING_WORD_INTERVAL_MS,
} from "@/features/conversation/smooth-streaming-text"

function usePrefersReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(() =>
    typeof window === "undefined"
      ? false
      : window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)")
    const updatePreference = () => setReducedMotion(mediaQuery.matches)

    updatePreference()
    mediaQuery.addEventListener("change", updatePreference)
    return () => mediaQuery.removeEventListener("change", updatePreference)
  }, [])

  return reducedMotion
}

export function useSmoothStreamedContent(
  content: string,
  streaming: boolean,
  {
    animateInitial = false,
    flushOnStreamEnd = false,
  }: { animateInitial?: boolean; flushOnStreamEnd?: boolean } = {}
) {
  void animateInitial
  const reducedMotion = usePrefersReducedMotion()
  // Hydrated content is already persisted history. Establish it as the
  // immediate baseline; only subsequent deltas belong in the pacing queue.
  // `animateInitial` remains accepted for callers but must not replay a whole
  // response after a reconnect or detail load.
  const initialContent = content
  const animationEnabledRef = useRef(streaming)
  const receivedContentRef = useRef(initialContent)
  const displayedContentRef = useRef(initialContent)
  const pendingWordsRef = useRef<string[]>([])
  const timerRef = useRef<number | undefined>(undefined)
  const [displayedContent, setDisplayedContent] = useState(initialContent)
  const [animationEnabled, setAnimationEnabled] = useState(streaming)
  const [animationStartOffset, setAnimationStartOffset] = useState(
    initialContent.length
  )

  const stopPump = useCallback(() => {
    if (timerRef.current !== undefined) {
      window.clearTimeout(timerRef.current)
      timerRef.current = undefined
    }
  }, [])

  const syncImmediately = useCallback(
    (nextContent: string) => {
      stopPump()
      pendingWordsRef.current = []
      receivedContentRef.current = nextContent
      displayedContentRef.current = nextContent
      setDisplayedContent(nextContent)
    },
    [stopPump]
  )

  const startPump = useCallback(() => {
    if (timerRef.current !== undefined) return

    const revealNextWord = () => {
      const nextWord = pendingWordsRef.current.shift()
      if (nextWord === undefined) {
        timerRef.current = undefined
        return
      }

      displayedContentRef.current += nextWord
      setDisplayedContent(displayedContentRef.current)
      timerRef.current = window.setTimeout(
        revealNextWord,
        STREAMING_WORD_INTERVAL_MS
      )
    }

    revealNextWord()
  }, [])

  useEffect(() => {
    if (!streaming || animationEnabledRef.current) return

    setAnimationStartOffset(receivedContentRef.current.length)
    animationEnabledRef.current = true
    setAnimationEnabled(true)
  }, [streaming])

  useEffect(() => {
    if (reducedMotion || !animationEnabledRef.current) {
      setAnimationStartOffset(content.length)
      syncImmediately(content)
      return
    }

    const previousContent = receivedContentRef.current
    receivedContentRef.current = content

    if (!content.startsWith(previousContent)) {
      setAnimationStartOffset(content.length)
      syncImmediately(content)
      return
    }

    const delta = content.slice(previousContent.length)
    if (!delta) return

    pendingWordsRef.current.push(...splitStreamingDelta(delta))
    startPump()
  }, [content, reducedMotion, startPump, syncImmediately])

  useEffect(() => {
    if (
      streaming ||
      !flushOnStreamEnd ||
      reducedMotion ||
      !animationEnabledRef.current ||
      displayedContentRef.current === receivedContentRef.current
    )
      return

    stopPump()
    pendingWordsRef.current = []
    displayedContentRef.current = receivedContentRef.current
    setDisplayedContent(receivedContentRef.current)
  }, [flushOnStreamEnd, reducedMotion, stopPump, streaming])

  useEffect(() => stopPump, [stopPump])

  return {
    animateFromOffset: animationStartOffset,
    animationEnabled:
      typeof window !== "undefined" && animationEnabled && !reducedMotion,
    displayedContent,
  }
}
