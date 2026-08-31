import { Gauge } from 'lucide-react'
import type { ReactNode } from 'react'
import { useState } from 'react'

import { ActionSwapRollText } from '@/components/motion/action-swap-roll'
import {
  MorphPopover,
  MorphPopoverContent,
  MorphPopoverTrigger,
} from '@/components/motion/popover-morph'
import { RangeSlider } from '@/components/motion/range-slider'
import { Button } from '@/components/motion/button'
import { Tooltip } from '@/components/motion/tooltip'
import type { ChatReasoningEffort } from '@/features/chat/model'

export type ReasoningEffortOption = {
  value: ChatReasoningEffort
  label: string
}

type ReasoningEffortProps = {
  options: ReasoningEffortOption[]
  value?: ChatReasoningEffort
  defaultValue?: ChatReasoningEffort
  onValueChange?: (value: ChatReasoningEffort) => void
  trailingAction?: ReactNode
  className?: string
}

export function ReasoningEffort({
  options,
  value,
  defaultValue,
  onValueChange,
  trailingAction,
  className,
}: ReasoningEffortProps) {
  const firstValue = defaultValue ?? options[0]?.value ?? ''
  const [internalValue, setInternalValue] = useState(firstValue)
  const currentValue = value ?? internalValue
  const currentIndex = Math.max(0, options.findIndex((option) => option.value === currentValue))
  const currentOption = options[currentIndex]

  if (!currentOption) return null

  const setValue = (nextIndex: number) => {
    const option = options[nextIndex]
    if (!option) return
    if (value === undefined) setInternalValue(option.value)
    onValueChange?.(option.value)
  }

  return (
    <MorphPopover className={className}>
      <Tooltip content={`Reasoning effort: ${currentOption.label}`} side="top">
        <MorphPopoverTrigger>
          <Button
            variant="ghost"
            size="icon"
            pressScale={0.96}
            aria-label={`Reasoning effort: ${currentOption.label}`}
            className="size-8 rounded-full text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Gauge aria-hidden="true" className="size-4" strokeWidth={1.75} />
          </Button>
        </MorphPopoverTrigger>
      </Tooltip>
      <MorphPopoverContent side="top" align="end" sideOffset={8} radius={16} className="w-56 px-3 pb-4 pt-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="text-xs leading-4 text-muted-foreground">Reasoning effort</p>
            <ActionSwapRollText value={currentOption.value} className="text-sm font-medium text-foreground">
              {currentOption.label}
            </ActionSwapRollText>
          </div>
          {trailingAction}
        </div>
        <RangeSlider
          value={currentIndex}
          min={0}
          max={Math.max(0, options.length - 1)}
          step={1}
          showTicks
          aria-label="Reasoning effort"
          formatValueText={(nextIndex) => options[nextIndex]?.label ?? ''}
          onValueChange={setValue}
          trackInset={14}
          trackClassName="bg-reasoning-track"
          fillClassName="bg-reasoning-fill"
          thumbClassName="size-7"
          className="mt-3 h-6 rounded-full"
        />
      </MorphPopoverContent>
    </MorphPopover>
  )
}
