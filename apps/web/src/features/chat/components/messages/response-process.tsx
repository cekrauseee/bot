import { BookOpenText, Search, Sparkles } from "lucide-react";

import { AgentActivity } from "@/features/chat/components/activity";
import { ThinkingShimmer } from "@/features/chat/components/activity/thinking-shimmer";
import {
  formatProcessDuration,
  responseProcessItems,
  type ResponseProcessBlock,
} from "./response-process-model";

export function ResponseProcess({
  blocks,
  activeLabel,
  duration,
}: {
  blocks: ResponseProcessBlock[];
  activeLabel?: string;
  duration?: number;
}) {
  const working = Boolean(activeLabel);
  const items = responseProcessItems(blocks, working);
  const durableItemCount = responseProcessItems(blocks, false).length;

  if (!working && durableItemCount === 0) return null;

  const searching = activeLabel === "Searching the web…";

  return (
    <AgentActivity
      items={items}
      contentType="mixed"
      status={working ? "working" : "complete"}
      activeLabel={activeLabel}
      duration={duration}
      summary={
        <>
          Processed for{' '}
          <span className="tabular-nums">
            {formatProcessDuration(duration)}
          </span>
        </>
      }
      defaultOpen={false}
      collapseOnComplete
      maxHeight={320}
      className="max-w-2xl py-1 text-sm leading-5"
      contentClassName="gap-1 pb-2"
      renderWorkingStatus={({ label }) => (
        <span className="flex min-w-0 items-center gap-2 text-sm">
          {searching ? (
            <Search
              aria-hidden="true"
              className="size-4 shrink-0"
              strokeWidth={1.7}
            />
          ) : (
            <Sparkles
              aria-hidden="true"
              className="size-4 shrink-0"
              strokeWidth={1.7}
            />
          )}
          <ThinkingShimmer className="truncate font-normal">
            {label}
          </ThinkingShimmer>
        </span>
      )}
      renderCompletedStatus={({ summary }) => (
        <span className="flex min-w-0 items-center gap-2 text-sm font-normal">
          <BookOpenText
            aria-hidden="true"
            className="size-4 shrink-0"
            strokeWidth={1.7}
          />
          <span className="truncate">{summary}</span>
        </span>
      )}
    />
  );
}
