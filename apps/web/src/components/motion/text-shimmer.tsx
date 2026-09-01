import { cn } from "@/lib/utils";
import type { ElementType, ReactNode } from "react";
import {
  TEXT_SHIMMER_CLASS_NAME,
  TEXT_SHIMMER_KEYFRAMES,
  textShimmerStyle,
} from "@/lib/text-shimmer";

export interface TextShimmerProps {
  children: ReactNode;
  as?: ElementType;
  active?: boolean;
  duration?: number;
  className?: string;
}

export function TextShimmer({
  children,
  as: Comp = "span",
  active = true,
  duration = 2.5,
  className,
}: TextShimmerProps) {
  return (
    <>
      <style>{active ? TEXT_SHIMMER_KEYFRAMES : ""}</style>
      <Comp
        style={active ? textShimmerStyle(duration) : undefined}
        className={cn(
          "inline-block",
          active && TEXT_SHIMMER_CLASS_NAME,
          className,
        )}
      >
        {children}
      </Comp>
    </>
  );
}
