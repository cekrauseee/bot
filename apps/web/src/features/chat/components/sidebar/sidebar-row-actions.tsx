import { forwardRef, type HTMLAttributes } from 'react'

import { cn } from '@/lib/utils'
import { SIDEBAR_ACTION_REVEAL_DURATION } from '../../motion/sidebar-motion'

/** Actions cover the trailing text without changing its layout or scroll position. */
export const SidebarRowActions = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement> & {
  visible: boolean
  highlighted: boolean
}>(function SidebarRowActions({ visible, highlighted, children, className, style, ...props }, ref) {
  return (
    <div
      {...props}
      ref={ref}
      style={{ ...style, transitionDuration: `${SIDEBAR_ACTION_REVEAL_DURATION}s` }}
      className={cn(
        'pointer-events-none absolute inset-y-1 end-1 flex items-stretch transition-opacity motion-reduce:transition-none',
        visible ? 'opacity-100' : 'opacity-0',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none w-3 shrink-0 bg-linear-to-r from-transparent rtl:bg-linear-to-l',
          highlighted ? 'to-muted' : 'to-background',
        )}
      />
      <div className={cn(
        'flex items-center gap-1 rounded-e-lg ps-1',
        highlighted ? 'bg-muted' : 'bg-background',
        visible && '[&>button]:pointer-events-auto',
      )}>
        {children}
      </div>
    </div>
  )
})
