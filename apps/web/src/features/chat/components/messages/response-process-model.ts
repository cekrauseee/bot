import type { AgentActivityItem } from "@/features/chat/components/activity";
import type {
  ChatActivityItem,
  ChatMessageBlock,
} from "@/features/chat/model";

export type ResponseProcessBlock = Extract<
  ChatMessageBlock,
  { type: "activity" | "reasoning" }
>;

export const isResponseProcessBlock = (
  block: ChatMessageBlock,
): block is ResponseProcessBlock =>
  block.type === "activity" || block.type === "reasoning";

export function formatProcessDuration(duration = 0) {
  const seconds = Math.max(1, Math.round(duration));
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder === 0 ? `${minutes}m` : `${minutes}m ${remainder}s`;
}

export function toAgentActivityItem(item: ChatActivityItem): AgentActivityItem {
  switch (item.type) {
    case "step":
      return {
        id: item.id,
        type: "step",
        label: item.label,
        status: item.status,
        meta: item.meta,
      };
    case "text":
      return { id: item.id, type: "text", content: item.content };
    case "search":
      return {
        id: item.id,
        type: "search",
        query: item.query,
        moreCount: item.moreCount,
        results: item.results?.map((result) => ({ ...result })),
      };
    case "tool":
      return {
        id: item.id,
        type: "tool",
        action: item.action,
        target: item.target,
        additions: item.additions,
        deletions: item.deletions,
      };
    case "trace":
      return {
        id: item.id,
        type: "trace",
        kind: item.kind,
        label: item.label,
        detail: item.detail,
      };
  }
}

export function responseProcessItems(
  blocks: ResponseProcessBlock[],
  includeReasoningSummaries: boolean,
): AgentActivityItem[] {
  const reasoningItems = includeReasoningSummaries
    ? blocks.flatMap((block) =>
        block.type === "reasoning" && block.content.trim()
          ? [{ id: block.id, type: "text" as const, content: block.content }]
          : [],
      )
    : blocks.flatMap((block) =>
        block.type === "reasoning" && block.content.trim()
          ? [{
              id: block.id,
              type: "step" as const,
              label: "Reasoned through the response",
              status: "complete" as const,
            }]
          : [],
      );
  const activities = blocks.flatMap((block) =>
    block.type === "activity" ? block.items.map(toAgentActivityItem) : [],
  );

  return [...reasoningItems, ...activities];
}
