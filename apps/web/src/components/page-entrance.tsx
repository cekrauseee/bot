import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { usePageEntrance } from '@/lib/use-page-entrance'

/** Static page frame; individual sections own entrance motion. */
export function PageEntrance({ children }: { children: ReactNode }) {
  return <div className="min-h-svh overflow-clip">{children}</div>
}

export function PageEntranceItem({ children, index, count = 4, className, id }: {
  children: ReactNode
  index: number
  count?: number
  className?: string
  id?: string
}) {
  const entrance = usePageEntrance(index, count)
  return (
    <motion.div id={id} {...entrance} className={cn('min-w-0', className)}>
      {children}
    </motion.div>
  )
}
