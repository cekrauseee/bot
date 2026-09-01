"use client";

import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { ThinkingShimmer } from "./thinking-shimmer";
import { CollapsiblePanel } from "../shared/collapsible-panel";
import { TranscriptInteractionContext } from "../shared/transcript-interaction-context";
import {
  EASE_OUT,
  SPRING_LAYOUT,
} from "@/lib/ease";
import { cn } from "@/lib/utils";
import { ActivityRow } from "./activity-row";
import type {
  AgentActivityContentType,
  AgentActivityItem,
  AgentActivityProps,
} from "./types";

export type {
  AgentActivityContentType,
  AgentActivityItem,
  AgentActivityProps,
  AgentActivitySearch,
  AgentActivityStatus,
  AgentActivityStep,
  AgentActivityText,
  AgentActivityTool,
  AgentActivityTrace,
  AgentSearchResult,
  AgentStepStatus,
  AgentTraceKind,
} from "./types";

function formatDuration(duration: number) {
  const seconds = Math.max(0, Math.round(duration));
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder === 0 ? `${minutes}m` : `${minutes}m ${remainder}s`;
}

function useControllableOpen({
  open,
  defaultOpen,
  onOpenChange,
}: {
  open?: boolean;
  defaultOpen: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const controlled = open !== undefined;
  const currentOpen = open ?? internalOpen;

  const setOpen = useCallback(
    (next: boolean) => {
      if (!controlled) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [controlled, onOpenChange],
  );

  return [currentOpen, setOpen] as const;
}

function getContentType(items: AgentActivityItem[]): AgentActivityContentType {
  const first = items[0]?.type;
  return first && items.every((item) => item.type === first) ? first : "mixed";
}

function getActiveLabel(type: AgentActivityContentType) {
  if (type === "search") return "Searching the web…";
  if (type === "tool") return "Running tools…";
  if (type === "trace") return "Working through the run…";
  if (type === "mixed") return "Working through it…";
  return "Thinking…";
}

function getSummary(
  type: AgentActivityContentType,
  items: AgentActivityItem[],
  duration: number,
): ReactNode {
  if (type === "step" || type === "text") {
    return (
      <>
        Thought for <span className="tabular-nums">{formatDuration(duration)}</span>
      </>
    );
  }
  if (type === "search") return "Searched the web";
  if (type === "tool") {
    return `Ran ${items.length} ${items.length === 1 ? "tool" : "tools"}`;
  }
  if (type === "trace") {
    const messages = items.filter(
      (item) =>
        item.type === "trace" &&
        (item.kind === "thinking" || item.kind === "message"),
    ).length;
    const tools = items.length - messages;
    return `${tools} ${tools === 1 ? "tool call" : "tool calls"}, ${messages} ${messages === 1 ? "message" : "messages"}`;
  }
  return `Completed ${items.length} ${items.length === 1 ? "step" : "steps"}`;
}

export function AgentActivity({
  items,
  contentType: initialContentType,
  status = "working",
  duration = 0,
  open,
  defaultOpen = false,
  onOpenChange,
  collapseOnComplete = true,
  activeLabel,
  summary,
  renderStatus,
  separated = false,
  maxHeight = 208,
  className,
  contentClassName,
}: AgentActivityProps) {
  const pauseTranscriptFollowing = useContext(TranscriptInteractionContext);
  const reduce = useReducedMotion() ?? false;
  const baseId = useId();
  const triggerId = `${baseId}-trigger`;
  const contentId = `${baseId}-content`;
  const viewportRef = useRef<HTMLDivElement>(null);
  const previousStatus = useRef(status);
  const [contentHeight, setContentHeight] = useState(0);
  const [currentOpen, setOpen] = useControllableOpen({
    open,
    defaultOpen,
    onOpenChange,
  });
  const working = status === "working";
  const hasDisclosure = items.length > 0;
  const expanded = working || currentOpen;
  const contentType = items.length
    ? getContentType(items)
    : (initialContentType ?? "mixed");
  const cappedHeight = Math.min(contentHeight, Math.max(0, maxHeight));
  const viewportHeight = working ? contentHeight : cappedHeight;
  const capped = !working && contentHeight > maxHeight;

  const measureContent = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;

    const measure = () => setContentHeight(node.offsetHeight);
    measure();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (previousStatus.current === "working" && status === "complete") {
      setOpen(!collapseOnComplete);
    }
    previousStatus.current = status;
  }, [collapseOnComplete, setOpen, status]);

  const toggle = () => {
    pauseTranscriptFollowing?.();
    const next = !currentOpen;
    setOpen(next);
    if (next) requestAnimationFrame(() => viewportRef.current?.scrollTo({ top: 0 }));
  };

  const liveLabel = activeLabel ?? getActiveLabel(contentType);
  const completedSummary = summary ?? getSummary(contentType, items, duration);
  const statusLabel = working ? liveLabel : completedSummary;
  const statusContent = renderStatus
    ? renderStatus({ label: statusLabel, duration, working })
    : working
      ? <ThinkingShimmer>{statusLabel}</ThinkingShimmer>
      : statusLabel;
  const headerClassName = cn(
    "group -ms-1.5 flex h-7 min-w-0 max-w-full items-center gap-1.5 rounded-md px-1.5 text-left font-medium text-muted-foreground outline-none transition-colors",
    hasDisclosure && !working && "hover:text-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:-outline-offset-2",
  );
  const headerContent = (
    <>
      <span className="min-w-0 truncate">{statusContent}</span>
      <AnimatePresence initial={false} mode="popLayout">
        {hasDisclosure && !working ? (
          <motion.span
            key="disclosure-chevron"
            aria-hidden="true"
            initial={reduce ? false : { opacity: 0, scale: 0.25, filter: "blur(4px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)", rotate: expanded ? 180 : 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.25, filter: "blur(4px)" }}
            transition={reduce
              ? { duration: 0 }
              : { type: "spring", duration: 0.3, bounce: 0 }}
            className="inline-flex shrink-0 text-muted-foreground/70 group-hover:text-foreground"
          >
            <ChevronDown className="size-3.5" />
          </motion.span>
        ) : null}
      </AnimatePresence>
    </>
  );
  return (
    <div
      data-state={working ? "working" : expanded ? "open" : "closed"}
      data-content={contentType}
      aria-busy={working}
      className={cn("flex w-full min-w-0 max-w-full flex-col text-xs leading-4", className)}
    >
      {working ? <span role="status" className="sr-only">Processing response</span> : null}
      {hasDisclosure && !working ? (
        <button
          id={triggerId}
          type="button"
          aria-expanded={expanded}
          aria-controls={contentId}
          onClick={toggle}
          className={headerClassName}
        >
          {headerContent}
        </button>
      ) : (
        <div
          id={triggerId}
          className={headerClassName}
        >
          {headerContent}
        </div>
      )}

      {separated ? (
        <motion.div
          layout="position"
          aria-hidden="true"
          transition={reduce ? { duration: 0 } : SPRING_LAYOUT}
          className={cn(
            "mt-1 h-px shrink-0 bg-border/70",
            working ? "order-1" : "order-2",
          )}
        />
      ) : null}

      {hasDisclosure ? <CollapsiblePanel
        id={contentId}
        role="region"
        aria-labelledby={triggerId}
        open={expanded}
        animateHeight
        openHeight={viewportHeight}
        layout="position"
        className={cn(
          "min-w-0 max-w-full transition-[margin-top] motion-reduce:transition-none",
          working ? "order-2" : "order-1",
          expanded ? "duration-[220ms]" : "duration-[140ms]",
        )}
      >
        <div
          ref={viewportRef}
          className={cn(
            "min-w-0 max-w-full overflow-x-hidden pr-1",
            capped ? "overflow-y-auto overscroll-contain" : "overflow-y-hidden",
          )}
          style={{ height: viewportHeight }}
        >
          <AnimatePresence initial={false}>
          {expanded ? <motion.div
            key="activity-content"
            ref={measureContent}
            initial={false}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.12, ease: EASE_OUT } }}
            transition={reduce ? { duration: 0 } : SPRING_LAYOUT}
            className="flex min-w-0 max-w-full flex-col"
          >
            <div
              role="list"
              aria-live="off"
              className={cn("flex min-w-0 max-w-full flex-col gap-1 py-2", contentClassName)}
            >
              <AnimatePresence initial={false} mode="popLayout">
                {items.map((item) => (
                  <motion.div
                    layout="position"
                    key={item.id}
                    role="listitem"
                    className="w-full min-w-0 max-w-full"
                    initial={reduce ? { opacity: 1 } : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduce ? { opacity: 0 } : { opacity: 0, y: -3 }}
                    transition={
                      reduce
                        ? { duration: 0 }
                        : {
                            opacity: { duration: 0.18, ease: EASE_OUT },
                            y: SPRING_LAYOUT,
                            layout: SPRING_LAYOUT,
                          }
                    }
                  >
                    <ActivityRow item={item} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </motion.div> : null}
          </AnimatePresence>
        </div>
      </CollapsiblePanel> : null}
    </div>
  );
}
