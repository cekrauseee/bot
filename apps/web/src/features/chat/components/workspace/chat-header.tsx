import { PanelLeft } from "lucide-react";
import { AnimatedSidebarTrigger } from "@/components/motion/animated-sidebar";

import type { ChatWorkspaceData } from "@/features/chat/model";
import { cn } from "@/lib/utils";

type Connection = ChatWorkspaceData["connection"];

function connectionClasses(status: Connection["status"]) {
  if (status === "connecting") {
    return "border-accent-foreground/20 bg-accent text-accent-foreground";
  }
  if (status === "disconnected") {
    return "border-destructive/25 bg-destructive/10 text-destructive";
  }
  return "border-success/25 bg-success/10 text-success";
}

export function ChatHeader({
  title,
  subtitle,
  connection,
}: {
  title: string;
  subtitle: string;
  connection: Connection;
}) {
  return (
    <header className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-border/60 px-4 py-2.5 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <AnimatedSidebarTrigger
          aria-label="Toggle sidebar"
          className="size-9 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <PanelLeft aria-hidden="true" className="size-4" />
        </AnimatedSidebarTrigger>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            {title}
          </p>
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <span
          className={cn(
            "hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium sm:flex",
            connectionClasses(connection.status),
          )}
        >
          <span className="size-1.5 rounded-full bg-current" />
          {connection.label}
        </span>
      </div>
    </header>
  );
}
