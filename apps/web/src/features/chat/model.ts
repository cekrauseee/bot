/** Serializable application data used by the chat feature. */
export type ChatUserView = {
  displayName: string;
  email: string;
  avatarUrl?: string;
};

export type ChatResourceKind = "folder" | "project" | "file" | "bookmark";

export type ChatResource = {
  id: string;
  label: string;
  kind: ChatResourceKind;
  children?: ChatResource[];
  disabled?: boolean;
};

export type ChatActivityItem =
  | {
      id: string;
      type: "step";
      label: string;
      status?: "pending" | "active" | "complete";
      meta?: string;
    }
  | { id: string; type: "text"; content: string }
  | {
      id: string;
      type: "search";
      query: string;
      results?: Array<{
        id: string;
        title: string;
        domain?: string;
        url?: string;
      }>;
      moreCount?: number;
    }
  | {
      id: string;
      type: "tool";
      action: string;
      target: string;
      additions?: number;
      deletions?: number;
    }
  | { id: string; type: "trace"; kind: string; label: string; detail?: string };

export type ChatTodo = {
  id: string;
  title: string;
  status: "pending" | "in-progress" | "completed" | "cancelled";
  progress?: number;
  detail?: string;
};

export type ChatToolApproval = {
  tool: string;
  title: string;
  description?: string;
  parameters: Array<{ id: string; label: string; value: string }>;
  status?:
    | "pending"
    | "approving"
    | "approved"
    | "denied"
    | "running"
    | "complete"
    | "error";
};

export type ChatApprovalDecision = "approve" | "always-allow" | "deny";

export type ChatMessageBlock =
  | { id: string; type: "text"; content: string }
  | {
      id: string;
      type: "activity";
      items: ChatActivityItem[];
      status?: "working" | "complete";
      duration?: number;
      summary?: string;
    }
  | {
      id: string;
      type: "todo-list";
      title: string;
      items: ChatTodo[];
      defaultOpen?: boolean;
    }
  | {
      id: string;
      type: "tool-approval";
      approval: ChatToolApproval;
      defaultOpen?: boolean;
    };

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  blocks: ChatMessageBlock[];
};

export type ChatModelOption = { value: string; label: string };
export type ChatReasoningOption = { value: string; label: string };

export type ChatWorkspaceData = {
  title: string;
  subtitle: string;
  connection: {
    label: string;
    status: "connected" | "connecting" | "disconnected";
  };
  resources: ChatResource[];
  expandedResourceIds: string[];
  activeResourceId: string | null;
  messages: ChatMessage[];
  models: ChatModelOption[];
  reasoningOptions: ChatReasoningOption[];
};
