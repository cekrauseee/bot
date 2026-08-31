import { EASE_OUT } from './ease'

export const INTERFACE_REVEAL = {
  duration: 0.45,
  stagger: 0.04,
  maxStagger: 0.12,
  reducedDuration: 0.12,
} as const

export const INTERFACE_ENTER_FROM = { opacity: 0, transform: 'translateY(12px)' } as const
export const INTERFACE_ENTER_TO = { opacity: 1, transform: 'translateY(0px)' } as const

export function interfaceRevealTransition(unitIndex: number, unitCount: number, reducedMotion: boolean) {
  const { duration, stagger, maxStagger, reducedDuration } = INTERFACE_REVEAL
  const gaps = Math.max(0, unitCount - 1)
  const delay = reducedMotion || gaps === 0
    ? 0
    : Math.min(Math.max(0, unitIndex), gaps) * Math.min(stagger, maxStagger / gaps)
  return {
    type: 'tween' as const,
    ease: EASE_OUT,
    delay,
    duration: (reducedMotion ? reducedDuration : duration) - delay,
  }
}
