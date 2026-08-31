"use client";

import { motion, type HTMLMotionProps, useReducedMotion } from "motion/react";
import type { CSSProperties } from "react";
import { EASE_OUT } from "@/lib/ease";
import { cn } from "@/lib/utils";

export interface CollapsiblePanelProps
  extends Omit<HTMLMotionProps<"div">, "animate" | "initial"> {
  open: boolean;
  openHeight?: CSSProperties["height"];
  animateHeight?: boolean;
}

/** Shared reveal, with optional animated layout for measured disclosures. */
export function CollapsiblePanel({
  open,
  openHeight = "auto",
  animateHeight = false,
  className,
  style,
  transition,
  ...props
}: CollapsiblePanelProps) {
  const reduce = useReducedMotion() ?? false;

  return (
    <motion.div
      {...props}
      aria-hidden={!open}
      inert={!open}
      initial={false}
      animate={
        reduce
          ? { opacity: open ? 1 : 0, ...(animateHeight ? { height: open ? openHeight : 0 } : {}) }
          : {
              opacity: open ? 1 : 0,
              ...(animateHeight
                ? { height: open ? openHeight : 0 }
                : { clipPath: open ? "inset(0 0 0% 0)" : "inset(0 0 100% 0)" }),
              y: open ? 0 : -4,
            }
      }
      transition={
        transition ?? {
          duration: reduce ? 0 : open ? 0.22 : 0.14,
          ease: EASE_OUT,
        }
      }
      className={cn("overflow-hidden", className)}
      style={{
        ...style,
        ...(animateHeight ? {} : { height: open ? openHeight : 0 }),
        pointerEvents: open ? undefined : "none",
        transformOrigin: "top",
      }}
    />
  );
}
