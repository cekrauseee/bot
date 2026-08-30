import {
  Check,
  Circle,
  FileText,
  Globe2,
  MessageSquare,
  PencilLine,
  Search,
  Sparkles,
  SquareTerminal,
  Waypoints,
  Wrench,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { EASE_OUT, SPRING_LAYOUT } from "@/lib/ease";
import { cn } from "@/lib/utils";
import type {
  AgentActivityItem,
  AgentActivitySearch,
  AgentActivityStep,
  AgentActivityText,
  AgentActivityTool,
  AgentActivityTrace,
  AgentSearchResult,
} from "./types";

function ActivityRowLayout({
  icon,
  label,
  detail,
  trailing,
  labelClassName,
  detailClassName,
}: {
  icon: ReactNode;
  label: ReactNode;
  detail?: ReactNode;
  trailing?: ReactNode;
  labelClassName?: string;
  detailClassName?: string;
}) {
  return (
    <div className="grid min-h-7 min-w-0 grid-cols-[1rem_minmax(0,1fr)] items-start gap-x-2.5 rounded-md px-1.5 py-1">
      <span
        aria-hidden="true"
        className="mt-0.5 grid size-4 place-items-center text-muted-foreground/65"
      >
        {icon}
      </span>
      <div className="min-w-0">
        <div className="flex min-w-0 items-baseline gap-2 leading-5">
          <span className={cn("min-w-0 text-foreground/85", labelClassName)}>
            {label}
          </span>
          {trailing ? <span className="ml-auto shrink-0">{trailing}</span> : null}
        </div>
        {detail ? (
          <div
            className={cn(
              "mt-0.5 break-words text-xs leading-4 text-muted-foreground/65",
              detailClassName,
            )}
          >
            {detail}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StepRow({ item }: { item: AgentActivityStep }) {
  const state = item.status ?? "complete";
  const reduce = useReducedMotion() ?? false;
  const icon = state === "complete" ? (
    <Check className="size-4" strokeWidth={1.8} />
  ) : state === "active" ? (
    <span className="relative grid size-3 place-items-center">
      <motion.span
        className="absolute inset-0 rounded-full bg-foreground/10"
        animate={reduce ? { opacity: 0.55 } : { opacity: [0.35, 0.8, 0.35] }}
        transition={
          reduce
            ? { duration: 0 }
            : { duration: 1.5, repeat: Number.POSITIVE_INFINITY }
        }
      />
      <span className="size-1.5 rounded-full bg-foreground/60" />
    </span>
  ) : (
    <Circle className="size-3" strokeWidth={1.5} />
  );

  return (
    <ActivityRowLayout
      icon={icon}
      label={item.label}
      detail={item.meta}
      labelClassName={state === "pending" ? "text-muted-foreground/55" : undefined}
    />
  );
}

function TextRow({ item }: { item: AgentActivityText }) {
  return (
    <div className="rounded-md py-1 ps-8 pe-1.5 leading-5 text-foreground/75">
      {item.content}
    </div>
  );
}

function SearchResultRow({
  result,
}: {
  result: AgentSearchResult;
}) {
  const content = (
    <>
      <span
        aria-hidden="true"
        className="grid size-5 shrink-0 place-items-center text-muted-foreground"
      >
        {result.icon ?? <Globe2 className="size-3" strokeWidth={2} />}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-foreground/85">{result.title}</span>
        {result.domain ? (
          <span className="block truncate text-xs leading-4 text-muted-foreground/55">
            {result.domain}
          </span>
        ) : null}
      </span>
    </>
  );
  const className = cn(
    "flex min-h-7 items-center gap-2 rounded-md px-1.5 py-1 text-left outline-none transition-colors",
    result.url && "focus-visible:ring-2 focus-visible:ring-ring",
  );

  return result.url ? (
    <a href={result.url} className={className}>
      {content}
    </a>
  ) : (
    <div className={className}>{content}</div>
  );
}

function SearchRow({ item }: { item: AgentActivitySearch }) {
  const reduce = useReducedMotion() ?? false;
  const enter = reduce ? { opacity: 1 } : { opacity: 0, y: 6 };
  const visible = { opacity: 1, y: 0 };
  const exit = reduce ? { opacity: 0 } : { opacity: 0, y: -3 };
  const transition = reduce
    ? { duration: 0 }
    : {
        opacity: { duration: 0.18, ease: EASE_OUT },
        y: SPRING_LAYOUT,
        layout: SPRING_LAYOUT,
      };

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex min-h-7 items-center gap-2.5 rounded-md px-1.5 py-1 text-foreground/80">
        <Search aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.7} />
        <span className="min-w-0 truncate">{item.query}</span>
      </div>
      {item.results?.length ? (
        <div className="flex flex-col gap-0.5 pl-4">
          <AnimatePresence initial mode="popLayout">
            {item.results.map((result) => (
              <motion.div
                layout="position"
                key={result.id}
                initial={enter}
                animate={visible}
                exit={exit}
                transition={transition}
              >
                <SearchResultRow result={result} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ) : null}
      <AnimatePresence initial>
        {item.moreCount ? (
          <motion.div
            key="more-results"
            initial={enter}
            animate={visible}
            exit={exit}
            transition={transition}
            className="px-1.5 py-1 pl-8 text-muted-foreground/55"
          >
            +{item.moreCount} more
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function ActionIcon({ action }: { action: string }) {
  const normalized = action.toLowerCase();
  if (normalized === "read") return <FileText className="size-4" />;
  if (
    normalized === "edit" ||
    normalized === "write" ||
    normalized === "updated"
  ) {
    return <PencilLine className="size-4" />;
  }
  if (normalized === "run" || normalized === "executed") {
    return <SquareTerminal className="size-4" />;
  }
  return <Wrench className="size-4" />;
}

function ToolRow({ item }: { item: AgentActivityTool }) {
  const action = item.action.charAt(0).toUpperCase() + item.action.slice(1);
  const changes =
    typeof item.additions === "number" || typeof item.deletions === "number" ? (
      <span className="flex items-center gap-2 font-mono text-xs tabular-nums">
        {typeof item.additions === "number" ? (
          <span className="text-success">+{item.additions}</span>
        ) : null}
        {typeof item.deletions === "number" ? (
          <span className="text-destructive">−{item.deletions}</span>
        ) : null}
      </span>
    ) : undefined;

  return (
    <ActivityRowLayout
      icon={<ActionIcon action={item.action} />}
      label={action}
      detail={item.target}
      trailing={changes}
      labelClassName="font-medium"
      detailClassName="break-all font-mono"
    />
  );
}

function TraceIcon({ kind }: { kind: AgentActivityTrace["kind"] }) {
  if (kind === "thinking") return <Sparkles className="size-4" />;
  if (kind === "message" || kind === "request") {
    return <MessageSquare className="size-4" />;
  }
  if (kind === "write") return <PencilLine className="size-4" />;
  if (kind === "run") return <SquareTerminal className="size-4" />;
  if (kind === "read") return <FileText className="size-4" />;
  return <Waypoints className="size-4" />;
}

function TraceRow({ item }: { item: AgentActivityTrace }) {
  return (
    <ActivityRowLayout
      icon={item.icon ?? <TraceIcon kind={item.kind} />}
      label={item.label}
      detail={item.detail}
      labelClassName="font-medium"
    />
  );
}

export function ActivityRow({ item }: { item: AgentActivityItem }) {
  if (item.type === "text") return <TextRow item={item} />;
  if (item.type === "search") return <SearchRow item={item} />;
  if (item.type === "tool") return <ToolRow item={item} />;
  if (item.type === "trace") return <TraceRow item={item} />;
  return <StepRow item={item} />;
}
