import {
  CircleAlert,
  ExternalLink,
  LoaderCircle,
  Maximize2,
  Minimize2,
  MousePointer2,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/motion/button";
import type {
  ChatBrowserFrame,
  ChatBrowserSession,
  ChatBrowserStatus,
} from "@/features/chat/model";
import { cn } from "@/lib/utils";

const statusLabel = (status: ChatBrowserStatus) => {
  if (status === "opening") return "Opening";
  if (status === "waiting-for-user") return "Waiting for you";
  if (status === "user-control") return "You have control";
  if (status === "agent-control") return "Agent has control";
  if (status === "closed") return "Closed";
  if (status === "error") return "Browser error";
  return "Active";
};

const noFrameMessage = (session: ChatBrowserSession) => {
  if (session.status === "opening") return "Opening browser…";
  if (session.status === "active") return "The browser is active. Waiting for a preview frame.";
  if (session.status === "waiting-for-user") return "The browser is waiting for your input.";
  if (session.status === "user-control") return "You have control. Waiting for a preview frame.";
  if (session.status === "agent-control") return "The agent has control. Waiting for a preview frame.";
  if (session.status === "closed") return session.message || "Browser preview closed.";
  return session.message || "The browser preview is unavailable.";
};

const clampPercent = (value: number) => Math.min(100, Math.max(0, value));

export type BrowserPipProps = {
  session?: ChatBrowserSession;
  frame?: ChatBrowserFrame;
  className?: string;
  layout?: "floating" | "docked";
};

export function BrowserPip({
  session,
  frame,
  className,
  layout = "floating",
}: BrowserPipProps) {
  const [collapsed, setCollapsed] = useState(false);
  if (!session || session.status === "closed") return null;

  const userControl = session.status === "user-control";
  const showAgentCursor =
    Boolean(session.cursor && frame) &&
    (session.status === "active" || session.status === "agent-control");

  return (
    <section
      aria-label="Browser preview"
      className={cn(
        "overflow-hidden border border-border/70 bg-background",
        layout === "docked"
          ? "w-full rounded-none border-x-0 border-t-0 shadow-none"
          : "w-[min(22rem,calc(100vw-1.5rem))] rounded-2xl shadow-lg",
        className,
      )}
    >
      <div className="flex min-h-11 items-center gap-2 px-3 py-2">
        <ExternalLink aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-xs font-medium text-foreground">
            {session.title || "Browser"}
          </h2>
          {session.url ? (
            <p className="truncate text-[11px] text-muted-foreground" dir="ltr">
              {session.url}
            </p>
          ) : null}
        </div>
        <span
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className={cn(
            "shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground",
            session.status === "error" && "bg-destructive/10 text-destructive",
            session.status === "waiting-for-user" && "bg-accent text-accent-foreground",
            userControl && "bg-primary text-primary-foreground",
          )}
        >
          {statusLabel(session.status)}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          aria-label={collapsed ? "Expand browser preview" : "Minimize browser preview"}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((value) => !value)}
        >
          {collapsed ? (
            <Maximize2 aria-hidden="true" className="size-3.5" />
          ) : (
            <Minimize2 aria-hidden="true" className="size-3.5" />
          )}
        </Button>
      </div>

      {!collapsed ? <div className="relative aspect-video overflow-hidden bg-muted">
        {frame ? (
          <img
            src={frame.src}
            alt={frame.alt || "Current browser page"}
            draggable={false}
            className="size-full object-cover"
          />
        ) : (
          <div className="grid size-full place-items-center px-5 text-center">
            {session.status === "opening" ? (
              <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
                <LoaderCircle aria-hidden="true" className="size-4 motion-safe:animate-spin" />
                {noFrameMessage(session)}
              </p>
            ) : session.status === "error" ? (
              <p role="alert" className="flex items-center gap-2 text-xs text-destructive">
                <CircleAlert aria-hidden="true" className="size-4" />
                {noFrameMessage(session)}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {noFrameMessage(session)}
              </p>
            )}
          </div>
        )}

        {showAgentCursor && session.cursor ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute flex items-start text-foreground drop-shadow-sm"
            style={{
              insetInlineStart: `${clampPercent(session.cursor.x)}%`,
              top: `${clampPercent(session.cursor.y)}%`,
            }}
          >
            <MousePointer2 className="size-4 fill-background" />
            <span className="ms-0.5 rounded-md bg-foreground px-1.5 py-0.5 text-[10px] font-medium text-background">
              {session.cursor.label || "Agent"}
            </span>
          </span>
        ) : null}
      </div> : null}

      {!collapsed ? (
        <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
          <p className="min-w-0 flex-1 text-[11px] leading-4 text-muted-foreground">
            {session.message || "Live preview only. Browser controls are not available here yet."}
          </p>
        </div>
      ) : null}
    </section>
  );
}
