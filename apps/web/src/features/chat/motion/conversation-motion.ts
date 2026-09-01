import { EASE_OUT } from '@/lib/ease'
import { INTERFACE_REVEAL, INTERFACE_ENTER_FROM, INTERFACE_ENTER_TO } from '@/lib/interface-motion'
export { interfaceRevealTransition as conversationRevealTransition } from '@/lib/interface-motion'

/** Spring for newly sent messages; history uses the coordinated reveal below. */
export const MESSAGE_POP_UP = {
  type: 'spring',
  stiffness: 320,
  damping: 32,
  mass: 0.7,
} as const

export const MESSAGE_POP_UP_FROM = INTERFACE_ENTER_FROM
export const MESSAGE_POP_UP_TO = INTERFACE_ENTER_TO

export const CONVERSATION_MOTION = {
  reveal: INTERFACE_REVEAL,
  title: {
    exitDuration: 0.12,
    blur: 6,
    yOffset: '18%',
  },
  pane: {
    enterDuration: 0.18,
    exitDuration: 0.12,
  },
  skeleton: {
    delayMs: 150,
    enterDuration: 0.16,
    exitDuration: 0.12,
  },
  message: {
    pop: MESSAGE_POP_UP,
    maxCascadeRows: 4,
  },
  ease: EASE_OUT,
} as const

export type ConversationPaneKind = 'loading' | 'ready' | 'error' | 'not-found'

export function conversationPaneKind({
  status,
  messageCount,
}: {
  status: 'idle' | 'loading' | 'ready' | 'refreshing' | 'error' | 'not-found'
  messageCount: number
}): ConversationPaneKind {
  if (status === 'ready' || status === 'refreshing' || messageCount > 0) return 'ready'
  if (status === 'not-found') return 'not-found'
  if (status === 'error') return 'error'
  return 'loading'
}

export const conversationPaneKey = (
  conversationKey: string,
  paneKind: ConversationPaneKind,
) => `${conversationKey}:${paneKind}`

export const conversationTitleVisualKey = (
  conversationKey: string,
  title: string,
  projectName: string | undefined,
  loading: boolean,
) => `${conversationKey}:${title}:${projectName ?? ''}:${loading}`

export function resolveConversationTitle({
  detailTitle,
  summaryTitle,
  status,
}: {
  detailTitle: string
  summaryTitle?: string
  status: 'idle' | 'loading' | 'ready' | 'refreshing' | 'error' | 'not-found'
}) {
  if (summaryTitle?.trim()) return { title: summaryTitle, loading: false }
  if (status === 'ready' || status === 'refreshing') {
    return { title: detailTitle || 'New conversation', loading: false }
  }
  if (status === 'error' || status === 'not-found') {
    return { title: detailTitle === 'New conversation' ? 'Conversation' : detailTitle, loading: false }
  }
  return { title: '', loading: true }
}

export function historyCascadeStartIndex(
  messageCount: number,
  maxRows = CONVERSATION_MOTION.message.maxCascadeRows,
) {
  return Math.max(0, messageCount - maxRows)
}
