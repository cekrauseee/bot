import { Folder, Plus } from 'lucide-react'

import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { sidebarSection, sidebarSectionHeader } from '../sidebar/sidebar-section-styles'

const projectWidths = ['w-28', 'w-36']
const recentWidths = ['w-44', 'w-36', 'w-48', 'w-32', 'w-40']

export function ChatSidebarSkeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn('flex w-full min-w-0 flex-col', className)}>
      <section className={cn(sidebarSection, 'pb-6')}>
        <div className={sidebarSectionHeader}>
          <span>Projects</span>
          <span className="grid size-6 place-items-center rounded-md text-muted-foreground">
            <Plus aria-hidden="true" className="size-3.5" />
          </span>
        </div>
        <div className="flex flex-col gap-0.5 px-1">
          {projectWidths.map((width, index) => (
            <div
              key={`project-${width}-${index}`}
              className="flex min-h-9 w-full min-w-0 items-center gap-2 rounded-xl px-2.5"
            >
              <Folder aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
              <Skeleton className={cn('h-3.5 max-w-full', width)} />
            </div>
          ))}
        </div>
      </section>
      <section className={sidebarSection}>
        <div className={sidebarSectionHeader}>
          Recents
        </div>
        <div className="flex flex-col gap-0.5 rounded-xl px-1">
          {recentWidths.map((width, index) => (
            <div
              key={`recent-${width}-${index}`}
              className="flex min-h-9 items-center overflow-hidden rounded-xl pe-1"
            >
              <div className="min-w-0 flex-1 px-2.5 py-2">
                <Skeleton className={cn('h-3.5 max-w-full', width)} />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
