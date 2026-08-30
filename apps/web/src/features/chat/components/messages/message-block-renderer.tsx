import { AgentActivity } from "@/features/chat/components/activity";
import {
  TaskList,
  type TaskItem,
} from "@/features/chat/components/tasks/task-list";
import { ToolApproval } from "@/features/chat/components/tools/tool-approval";
import type {
  ChatApprovalDecision,
  ChatMessageBlock,
  ChatTodo,
  ChatToolApproval,
} from "@/features/chat/model";
import type { ToolApprovalParameter } from "@/features/chat/components/tools/tool-approval";
import type { SearchSource } from "@/features/chat/model";
import { lazy, Suspense } from "react";
import { toAgentActivityItem } from "./response-process-model";

const MarkdownResponse = lazy(async () => {
  const module = await import("./markdown-response");
  return { default: module.MarkdownResponse };
});

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
  responseStatus = "complete",
  sources = [],
}: {
  block: ChatMessageBlock;
  onApprovalDecision?: (
    blockId: string,
    decision: ChatApprovalDecision,
  ) => void;
  responseStatus?: "streaming" | "complete" | "error";
  sources?: SearchSource[];
}) {
  switch (block.type) {
    case "reasoning":
      return (
        <AgentActivity items={[{ id: block.id, type: "text", content: block.content }]} status={block.status ?? "complete"} summary="Reasoning" defaultOpen collapseOnComplete={false} className="max-w-3xl" />
      );
    case "text":
      return (
        <Suspense
          fallback={
            <p className="max-w-3xl whitespace-pre-wrap px-1 text-sm leading-6 text-foreground/90">
              {block.content}
            </p>
          }
        >
          <MarkdownResponse
            content={block.content}
            status={responseStatus}
            sources={sources}
          />
        </Suspense>
      );
    case "activity":
      return (
        <AgentActivity
          items={block.items.map(toAgentActivityItem)}
          status={block.status ?? "working"}
          duration={block.duration}
          summary={block.summary}
          defaultOpen
          collapseOnComplete={false}
          className="max-w-3xl text-xs leading-4 text-foreground/80"
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
