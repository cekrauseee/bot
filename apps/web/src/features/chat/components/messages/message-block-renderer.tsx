import { AgentActivity } from "@/features/chat/components/activity";
import type { AgentActivityItem } from "@/features/chat/components/activity";
import {
  TaskList,
  type TaskItem,
} from "@/features/chat/components/tasks/task-list";
import { ToolApproval } from "@/features/chat/components/tools/tool-approval";
import type {
  ChatApprovalDecision,
  ChatActivityItem,
  ChatMessageBlock,
  ChatTodo,
  ChatToolApproval,
} from "@/features/chat/model";
import type { ToolApprovalParameter } from "@/features/chat/components/tools/tool-approval";

function activityItem(item: ChatActivityItem): AgentActivityItem {
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

function taskItem(item: ChatTodo): TaskItem {
  return {
    id: item.id,
    title: item.title,
    status: item.status,
    progress: item.progress,
    detail: item.detail,
  };
}

function approvalParameter(
  parameter: ChatToolApproval["parameters"][number],
): ToolApprovalParameter {
  return { id: parameter.id, label: parameter.label, value: parameter.value };
}

export function MessageBlockRenderer({
  block,
  onApprovalDecision,
}: {
  block: ChatMessageBlock;
  onApprovalDecision?: (
    blockId: string,
    decision: ChatApprovalDecision,
  ) => void;
}) {
  switch (block.type) {
    case "text":
      return (
        <p className="max-w-xl px-1 text-sm leading-5 text-foreground/85">
          {block.content}
        </p>
      );
    case "activity":
      return (
        <AgentActivity
          items={block.items.map(activityItem)}
          status={block.status ?? "working"}
          duration={block.duration}
          summary={block.summary}
          defaultOpen
          collapseOnComplete={false}
          className="max-w-xl text-xs leading-4 text-foreground/80"
        />
      );
    case "todo-list":
      return (
        <TaskList
          items={block.items.map(taskItem)}
          title={block.title}
          defaultOpen={block.defaultOpen}
        />
      );
    case "tool-approval":
      return (
        <ToolApproval
          {...block.approval}
          parameters={block.approval.parameters.map(approvalParameter)}
          onApprove={
            onApprovalDecision
              ? () => onApprovalDecision(block.id, "approve")
              : undefined
          }
          onAlwaysAllow={
            onApprovalDecision
              ? () => onApprovalDecision(block.id, "always-allow")
              : undefined
          }
          onDeny={
            onApprovalDecision
              ? () => onApprovalDecision(block.id, "deny")
              : undefined
          }
          defaultOpen={block.defaultOpen}
        />
      );
  }
}
