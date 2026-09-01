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
import { MarkdownResponse } from "./markdown-response";
import { toAgentActivityItem } from "./response-process-model";

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
  createdAt,
}: {
  block: ChatMessageBlock;
  onApprovalDecision?: (
    blockId: string,
    decision: ChatApprovalDecision,
  ) => void;
  responseStatus?: "streaming" | "complete" | "error";
  sources?: SearchSource[];
  createdAt?: string;
}) {
  switch (block.type) {
    case "reasoning":
      return (
        <AgentActivity
          items={[{
            id: block.id,
            type: "text",
            content: block.content,
            format: "markdown",
            status: block.status === "working" ? "streaming" : "complete",
          }]}
          status={block.status ?? "complete"}
          summary="Reasoning"
          defaultOpen
          collapseOnComplete={false}
          className="max-w-3xl"
        />
      );
    case "text":
      return (
        <MarkdownResponse
          content={block.content}
          status={responseStatus}
          sources={sources}
          createdAt={createdAt}
        />
      );
    case "activity":
      return (
          <AgentActivity
          items={block.items.map((item) =>
            toAgentActivityItem(item, block.status === "working"),
          )}
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
