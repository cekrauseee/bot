"use client";
// beui.dev/components/motion/range-slider

import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "motion/react";
import { useEffect } from "react";

import { SPRING_GLIDE } from "@/lib/ease";
import { type SliderOptions, useSlider } from "@/lib/hooks/use-slider";
import { TOUCH_GESTURE_CLASS } from "@/lib/touch";
import { cn } from "@/lib/utils";

// Bouncy grab feedback for the thumb scale only.
const SPRING_BOUNCY = { type: "spring", stiffness: 500, damping: 14, mass: 0.7 } as const;

export interface RangeSliderProps extends SliderOptions {
  /** Render a tick dot at each step. */
  showTicks?: boolean;
  trackClassName?: string;
  fillClassName?: string;
  tickClassName?: string;
  thumbClassName?: string;
  className?: string;
}

export function RangeSlider({
  showTicks = true,
  trackClassName,
  fillClassName,
  tickClassName,
  thumbClassName,
  trackInset = 16,
  className,
  ...options
}: RangeSliderProps) {
  const reduce = useReducedMotion();
  const { current, percent, dragging, min, max, step, trackProps, sliderProps } = useSlider({
    ...options,
    trackInset,
  });

  // Spring-smoothed position drives both the thumb and the fill.
  const target = useMotionValue(percent);
  useEffect(() => {
    target.set(percent);
  }, [percent, target]);
  const smooth = useSpring(target, SPRING_GLIDE);
  const pos = reduce ? target : smooth;
  const left = useMotionTemplate`${pos}%`;

  // Floor rather than round, so a range the step does not divide (0 to 10 by 4)
  // stops its dots at the last whole step instead of drawing one past max.
  // toFixed comes first because 0.3/0.1 is 2.9999999999999996, which would
  // floor to 2 and drop the last dot.
  const steps = Math.floor(Number(((max - min) / step).toFixed(6)));
  const ticks =
    showTicks && steps > 0 && steps <= 50
      ? Array.from({ length: steps + 1 }, (_, i) => Number((min + i * step).toFixed(6)))
      : [];

  return (
    <div
      {...trackProps}
      className={cn(
        "relative flex h-10 w-full touch-none items-center rounded-full",
        TOUCH_GESTURE_CLASS,
        options.disabled
          ? "pointer-events-none opacity-50"
          : "cursor-grab active:cursor-grabbing",
        className,
      )}
    >
      <div className={cn("pointer-events-none absolute inset-0 overflow-hidden rounded-full bg-muted", trackClassName)}>
        <div
          aria-hidden="true"
          className={cn("absolute inset-y-0 left-0 bg-foreground/15", fillClassName)}
          style={{ width: trackInset }}
        />
        <div className="absolute inset-y-0" style={{ left: trackInset, right: trackInset }}>
          <motion.div
            aria-hidden="true"
            className={cn("absolute inset-y-0 left-0 bg-foreground/15", fillClassName)}
            style={{ width: left }}
          />
        </div>
      </div>

      <div className="absolute inset-y-0" style={{ left: trackInset, right: trackInset }}>
        <div className="pointer-events-none absolute inset-0">
          {ticks.map((t) => {
            const tp = ((t - min) / (max - min)) * 100;
            return (
              <span
                key={t}
                className={cn(
                  "absolute top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full",
                  t <= current ? "bg-background/70" : "bg-foreground/25",
                  tickClassName,
                )}
                style={{ left: `${tp}%` }}
              />
            );
          })}
        </div>

        <motion.div
          {...sliderProps}
          animate={reduce ? undefined : { scale: dragging ? 0.96 : 1 }}
          transition={SPRING_BOUNCY}
          className={cn(
            "absolute top-1/2 size-8 -translate-x-1/2 rounded-full border border-foreground/30 bg-background shadow-sm outline-none",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            thumbClassName,
          )}
          style={{ left, y: "-50%" }}
        />
      </div>
    </div>
  );
}
