import type { ReactNode } from "react";
import { TextShimmer } from "@/components/motion/text-shimmer";
import { cn } from "@/lib/utils";

export interface ThinkingShimmerProps {
  /** Loading message shown to the user. */
  children?: ReactNode;
  /** Keeps the same text node while enabling or disabling the loading treatment. */
  active?: boolean;
  /** Seconds taken for one shimmer pass. */
  duration?: number;
  className?: string;
}

export function ThinkingShimmer({
  children = "Thinking…",
  active = true,
  duration = 1.8,
  className,
}: ThinkingShimmerProps) {
  return (
    <TextShimmer
      as="span"
      active={active}
      duration={duration}
      className={cn("font-medium", className)}
    >
      {children}
    </TextShimmer>
  );
}
