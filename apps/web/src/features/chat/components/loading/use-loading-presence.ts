import { useEffect, useState } from 'react'

import { CONVERSATION_MOTION } from '@/features/chat/motion/conversation-motion'

export function useLoadingPresence({
  defer,
  presenceKey,
  show,
}: {
  defer: boolean
  presenceKey: string
  show: boolean
}) {
  const [revealedKey, setRevealedKey] = useState<string | null>(null)

  useEffect(() => {
    if (!show || !defer) return

    const timer = window.setTimeout(
      () => setRevealedKey(presenceKey),
      CONVERSATION_MOTION.skeleton.delayMs,
    )
    return () => window.clearTimeout(timer)
  }, [defer, presenceKey, show])

  return show && (!defer || revealedKey === presenceKey)
}
