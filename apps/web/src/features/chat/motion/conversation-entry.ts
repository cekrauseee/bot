export const CONVERSATION_ENTRY = {
  durationMs: 240,
  staggerMs: 30,
  ease: [0.3, 0, 0.12, 1] as const,
  cssEase: 'cubic-bezier(0.3, 0, 0.12, 1)',
}

/** Read only at animation start, never during render or on every frame. */
export function createConversationEntry(now = () => performance.now()) {
  let startedAt: number | undefined
  let selectedKey: string | undefined
  let activeKey: string | undefined
  return {
    select(key: string) { selectedKey = key },
    begin() { activeKey = selectedKey; startedAt = now() },
    elapsed(key: string) {
      return startedAt === undefined || activeKey !== key ? undefined : Math.max(0, now() - startedAt)
    },
  }
}

export type ConversationEntry = ReturnType<typeof createConversationEntry>

export function coordinatedMessageTransition(index: number, count: number, elapsedMs: number, reduce: boolean) {
  if (reduce) return { type: 'tween' as const, duration: 0.12, delay: 0, ease: CONVERSATION_ENTRY.ease }
  const gaps = Math.max(0, count - 1)
  const delayMs = Math.min(Math.max(0, index), gaps) * (gaps ? Math.min(CONVERSATION_ENTRY.staggerMs, 90 / gaps) : 0)
  // A cold/large history arriving after docking still gets a brief reveal.
  // It never restarts the composer or replays a long entrance backlog.
  const elapsed = elapsedMs < CONVERSATION_ENTRY.durationMs ? elapsedMs : 0
  return {
    type: 'tween' as const,
    ease: CONVERSATION_ENTRY.ease,
    duration: (CONVERSATION_ENTRY.durationMs - delayMs) / 1000,
    delay: (delayMs - elapsed) / 1000,
  }
}
