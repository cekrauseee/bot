import {
  FileText,
  Globe2,
  MessageSquare,
  PencilLine,
  Search,
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
  icon?: ReactNode;
  label: ReactNode;
  detail?: ReactNode;
  trailing?: ReactNode;
  labelClassName?: string;
  detailClassName?: string;
}) {
  const title = [label, detail]
    .filter(
      (value): value is string | number =>
        typeof value === "string" || typeof value === "number",
    )
    .map(String)
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      title={title || undefined}
      className="flex min-h-6 w-full min-w-0 max-w-full items-center gap-2 rounded-md leading-5"
    >
      {icon ? (
        <span
          aria-hidden="true"
          className="grid size-3.5 shrink-0 place-items-center text-muted-foreground [&_svg]:size-3.5 [&_svg]:stroke-[1.5]"
        >
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1 truncate text-muted-foreground">
        <span className={labelClassName}>{label}</span>
        {detail != null ? (
          <>
            <span className="text-muted-foreground">
              {" · "}
            </span>
            <span
              className={cn(
                "text-muted-foreground",
                detailClassName,
              )}
            >
              {detail}
            </span>
          </>
        ) : null}
      </span>
      {trailing ? <span className="shrink-0">{trailing}</span> : null}
    </div>
  );
}

function StepRow({ item }: { item: AgentActivityStep }) {
  const state = item.status ?? "complete";

  return (
    <NarrativeRow
      className={
        state === "pending"
          ? "text-muted-foreground"
          : state === "active"
            ? "text-foreground"
            : undefined
      }
    >
      {item.label}
      {item.meta != null ? (
        <span className="text-muted-foreground"> · {item.meta}</span>
      ) : null}
    </NarrativeRow>
  );
}

function NarrativeRow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "min-h-6 w-full min-w-0 max-w-full py-0.5 whitespace-pre-wrap [overflow-wrap:anywhere] leading-5 text-foreground/85",
        className,
      )}
    >
      {children}
    </div>
  );
}

function TextRow({ item }: { item: AgentActivityText }) {
  return <NarrativeRow>{item.content}</NarrativeRow>;
}

function SearchResultRow({
  result,
}: {
  result: AgentSearchResult;
}) {
  const title = [result.title, result.domain]
    .filter(
      (value): value is string | number =>
        typeof value === "string" || typeof value === "number",
    )
    .map(String)
    .filter(Boolean)
    .join(" · ");
  const content = (
    <>
      <span
        aria-hidden="true"
        className="grid size-3.5 shrink-0 place-items-center text-muted-foreground [&_svg]:size-3.5 [&_svg]:stroke-[1.5]"
      >
        {result.icon ?? <Globe2 className="size-3" strokeWidth={2} />}
      </span>
      <span className="min-w-0 flex-1 truncate text-muted-foreground">
        {result.title}
        {result.domain ? (
          <>
            <span className="text-muted-foreground">
              {" · "}
            </span>
            <span className="text-muted-foreground">
              {result.domain}
            </span>
          </>
        ) : null}
      </span>
    </>
  );
  const className = cn(
    "flex min-h-6 w-full min-w-0 max-w-full items-center gap-2 rounded-md text-left leading-5 outline-none transition-colors",
    result.url && "hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
  );

  return result.url ? (
    <a href={result.url} title={title || undefined} className={className}>
      {content}
    </a>
  ) : (
    <div title={title || undefined} className={className}>
      {content}
    </div>
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
    <div className="flex w-full min-w-0 max-w-full flex-col gap-1">
      <ActivityRowLayout
        icon={<Search />}
        label={item.query}
        trailing={item.moreCount ? (
          <span className="text-muted-foreground">
            +{item.moreCount} more
          </span>
        ) : undefined}
      />
      {item.results?.length ? (
        <div className="flex min-w-0 max-w-full flex-col gap-1 ps-5.5">
          <AnimatePresence initial mode="popLayout">
            {item.results.map((result) => (
              <motion.div
                layout="position"
                key={result.id}
                className="w-full min-w-0 max-w-full"
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
      detailClassName="font-mono"
    />
  );
}

function TraceIcon({ kind }: { kind: AgentActivityTrace["kind"] }) {
  if (kind === "message" || kind === "request") {
    return <MessageSquare className="size-4" />;
  }
  if (kind === "write") return <PencilLine className="size-4" />;
  if (kind === "run") return <SquareTerminal className="size-4" />;
  if (kind === "read") return <FileText className="size-4" />;
  return <Waypoints className="size-4" />;
}

function TraceRow({ item }: { item: AgentActivityTrace }) {
  if (item.kind === "thinking" || item.kind === "message") {
    return (
      <NarrativeRow>
        {item.label}
        {item.detail != null ? (
          <span className="text-muted-foreground"> · {item.detail}</span>
        ) : null}
      </NarrativeRow>
    );
  }

  return (
    <ActivityRowLayout
      icon={item.icon ?? <TraceIcon kind={item.kind} />}
      label={item.label}
      detail={item.detail}
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
