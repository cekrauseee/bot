import { cn } from '@/lib/utils'

export function ScrollDivider({ visible, edge = 'bottom' }: { visible: boolean; edge?: 'top' | 'bottom' }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute inset-x-0 h-px bg-border/60 transition-opacity duration-150 motion-reduce:transition-none',
        edge === 'top' ? 'top-0' : 'bottom-0',
        visible ? 'opacity-100' : 'opacity-0',
      )}
    />
  )
}
