import { CheckCircle2, CircleDot, ListTodo } from 'lucide-react'

import { Button } from '@/components/motion/button'
import {
  MorphPopover,
  MorphPopoverContent,
  MorphPopoverTrigger,
} from '@/components/motion/popover-morph'
import type { ChatTodo } from '@/features/chat/model'
import { TaskList } from './task-list'

export function TaskPlanBadge({ items = [] }: { items?: ChatTodo[] }) {
  if (!items.length) return null
  const completed = items.filter((item) => item.status === 'completed').length
  const activeIndex = items.findIndex((item) => item.status === 'in-progress')
  const complete = completed === items.length
  const label = complete
    ? 'Plan complete'
    : activeIndex >= 0 ? `Step ${activeIndex + 1} / ${items.length}` : `Plan ${completed} / ${items.length}`
  const Icon = complete ? CheckCircle2 : activeIndex >= 0 ? CircleDot : ListTodo

  return (
    <div className="mb-2 flex justify-center">
      <MorphPopover>
        <MorphPopoverTrigger>
          <Button
            variant="outline"
            size="sm"
            pressScale={0.96}
            aria-label={`${label}, ${completed} of ${items.length} steps complete`}
            className="h-7 gap-1.5 rounded-full px-3 text-xs text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Icon aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
            <span className="tabular-nums">{label}</span>
          </Button>
        </MorphPopoverTrigger>
        <MorphPopoverContent
          side="top"
          align="center"
          sideOffset={8}
          radius={16}
          className="w-[min(24rem,calc(100vw-2rem))] p-1"
        >
          <TaskList
            items={items}
            title="Task plan"
            collapseOnComplete={false}
            maxHeight={280}
            className="border-0"
          />
        </MorphPopoverContent>
      </MorphPopover>
    </div>
  )
}
