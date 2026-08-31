export const SIDEBAR_LAYOUT_TRANSITION = {
  type: 'spring',
  duration: 0.24,
  bounce: 0,
} as const

export const SIDEBAR_FADE_TRANSITION = { duration: 0.12, ease: 'easeOut' } as const

// Titles start scrolling only after the action strip is fully opaque.
export const SIDEBAR_ACTION_REVEAL_DURATION = 0.15
