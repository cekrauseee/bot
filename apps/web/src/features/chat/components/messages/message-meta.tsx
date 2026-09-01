import { Check, Copy } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Tooltip } from "@/components/motion/tooltip";
import { EASE_OUT, SPRING_PRESS } from "@/lib/ease";
import { cn } from "@/lib/utils";
import { formatMessageTimestamp } from "./message-time";

const COPY_RESET_DELAY = 1_600;

export function MessageTimestamp({
  createdAt,
  className,
}: {
  createdAt?: string;
  className?: string;
}) {
  if (!createdAt) return null;
  const label = formatMessageTimestamp(createdAt);
  if (!label) return null;

  return (
    <time
      dateTime={createdAt}
      className={cn("whitespace-nowrap tabular-nums", className)}
    >
      {label}
    </time>
  );
}

export function MessageCopyAction({
  text,
  label = "Copy message",
}: {
  text: string;
  label?: string;
}) {
  const reduce = useReducedMotion() ?? false;
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      if (resetTimer.current) window.clearTimeout(resetTimer.current);
    },
    [],
  );

  const copy = useCallback(async () => {
    await navigator.clipboard?.writeText(text);
    setCopied(true);
    if (resetTimer.current) window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(
      () => setCopied(false),
      COPY_RESET_DELAY,
    );
  }, [text]);

  const actionLabel = copied ? "Copied" : label;

  return (
    <Tooltip content={actionLabel} side="top">
      <motion.button
        type="button"
        data-slot="message-copy-action"
        aria-label={actionLabel}
        onClick={copy}
        whileTap={reduce ? undefined : { scale: 0.96 }}
        transition={SPRING_PRESS}
        className="relative grid size-7 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            key={copied ? "copied" : "copy"}
            aria-hidden="true"
            initial={
              reduce
                ? { opacity: 0 }
                : { opacity: 0, scale: 0.25, filter: "blur(4px)" }
            }
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            exit={
              reduce
                ? { opacity: 0 }
                : { opacity: 0, scale: 0.25, filter: "blur(4px)" }
            }
            transition={
              reduce
                ? { duration: 0.12, ease: EASE_OUT }
                : { type: "spring", duration: 0.3, bounce: 0 }
            }
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          </motion.span>
        </AnimatePresence>
      </motion.button>
    </Tooltip>
  );
}

export function HoverMessageMeta({
  copyText,
  createdAt,
}: {
  copyText: string;
  createdAt?: string;
}) {
  return (
    <div
      data-slot="message-hover-meta"
      className="pointer-events-auto absolute top-full end-0 flex items-center gap-1.5 pt-1.5 opacity-0 motion-safe:transition-opacity motion-safe:duration-150 motion-safe:ease-out hover:opacity-100 group-hover/message:opacity-100 group-has-[:focus-visible]/message:opacity-100 [@media(hover:none)]:opacity-100"
    >
      <MessageTimestamp
        createdAt={createdAt}
        className="text-xs font-normal leading-4 text-muted-foreground"
      />
      <MessageCopyAction text={copyText} />
    </div>
  );
}

export function HoverMessageTimestamp({ createdAt }: { createdAt?: string }) {
  return (
    <MessageTimestamp
      createdAt={createdAt}
      className="text-xs font-normal leading-4 text-muted-foreground"
    />
  );
}
