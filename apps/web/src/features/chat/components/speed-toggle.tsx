import { Zap } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/motion/button'
import { Tooltip } from '@/components/motion/tooltip'
import { cn } from '@/lib/utils'

type SpeedToggleProps = {
  value?: boolean
  defaultValue?: boolean
  onValueChange?: (value: boolean) => void
  className?: string
}

const SPEED_TOOLTIP_CONTENT = (
  <span className="flex flex-col gap-0.5 text-left">
    <span className="text-xs font-medium">Faster responses</span>
    <span className="text-xs font-normal text-primary-foreground/60">Higher usage</span>
  </span>
)

export function SpeedToggle({
  value,
  defaultValue = false,
  onValueChange,
  className,
}: SpeedToggleProps) {
  const [internalValue, setInternalValue] = useState(defaultValue)
  const currentValue = value ?? internalValue

  const toggle = () => {
    const nextValue = !currentValue
    if (value === undefined) setInternalValue(nextValue)
    onValueChange?.(nextValue)
  }

  const stateLabel = currentValue ? 'Fast mode on' : 'Fast mode off'

  return (
    <Tooltip
      side="top"
      content={SPEED_TOOLTIP_CONTENT}
      className="rounded-xl border-transparent bg-primary px-3 py-2 text-primary-foreground shadow-xl"
      wrapperClassName="shrink-0"
    >
      <Button
        variant="ghost"
        size="icon"
        pressScale={0.96}
        aria-label={`${stateLabel}. Faster responses with higher usage.`}
        aria-pressed={currentValue}
        onClick={toggle}
        className={cn(
          'size-8 rounded-full text-muted-foreground hover:bg-reasoning-fill/10 hover:text-reasoning-fill focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          currentValue && 'text-reasoning-fill',
          className,
        )}
      >
        <Zap
          aria-hidden="true"
          className="size-4"
          fill={currentValue ? 'currentColor' : 'none'}
        />
      </Button>
    </Tooltip>
  )
}
