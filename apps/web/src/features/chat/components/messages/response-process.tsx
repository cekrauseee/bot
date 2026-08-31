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
      className="w-full min-w-0 max-w-3xl border-b border-border/70 pt-0.5 pb-3 text-xs leading-4"
      contentClassName="gap-1 pt-1 pb-2"
      renderWorkingStatus={({ label }) => (
        <span className="block min-w-0 max-w-full text-xs">
          <ThinkingShimmer className="truncate font-normal">
            {label}
          </ThinkingShimmer>
        </span>
      )}
      renderCompletedStatus={({ summary }) => (
        <span className="block min-w-0 truncate text-xs font-normal">
          {summary}
        </span>
      )}
    />
  );
}
