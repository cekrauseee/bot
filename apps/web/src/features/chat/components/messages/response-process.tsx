import { AgentActivity } from "@/features/chat/components/activity";
import { ThinkingShimmer } from "@/features/chat/components/activity/thinking-shimmer";
import { useEffect, useMemo, useState } from "react";
import {
  formatProcessLabel,
  responseProcessItems,
  type ResponseProcessBlock,
} from "./response-process-model";

function useLiveProcessDuration(
  working: boolean,
  startedAt: number | undefined,
  duration: number | undefined,
) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!working || startedAt === undefined) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [startedAt, working]);

  return working && startedAt !== undefined
    ? Math.max(1, (now - startedAt) / 1_000)
    : duration;
}

export function ResponseProcess({
  blocks,
  working = false,
  startedAt,
  duration,
}: {
  blocks: ResponseProcessBlock[];
  working?: boolean;
  startedAt?: number;
  duration?: number;
}) {
  const liveDuration = useLiveProcessDuration(working, startedAt, duration);
  const items = useMemo(
    () => responseProcessItems(blocks, working),
    [blocks, working],
  );

  return (
    <AgentActivity
      items={items}
      contentType="mixed"
      status={working ? "working" : "complete"}
      activeLabel={formatProcessLabel(liveDuration, true)}
      duration={liveDuration}
      summary={formatProcessLabel(liveDuration, false)}
      defaultOpen={false}
      collapseOnComplete
      maxHeight={320}
      separated={items.length > 0}
      className="w-full min-w-0 max-w-3xl pt-0.5 text-sm leading-5"
      contentClassName="gap-4 pt-4 pb-3"
      renderStatus={({ label, working: isWorking }) => (
        <span className="block min-w-0 max-w-full text-sm leading-5 tabular-nums">
          <ThinkingShimmer active={isWorking} className="truncate font-normal">
            {label}
          </ThinkingShimmer>
        </span>
      )}
    />
  );
}
