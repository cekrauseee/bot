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
  | {
      id: string;
      type: "text";
      content: string;
      /** Last stream event folded into this contiguous reasoning segment. */
      lastSequence?: number;
    }
  | {
      id: string;
      type: "search";
      query: string;
      results?: SearchSource[];
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
  | { id: string; type: "reasoning"; content: string; status?: "working" | "complete" }
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
  renderKey?: string;
  createdAt?: string;
  errorMessage?: string;
  /** Keeps the failed surface visible until a retry produces actual progress. */
  retryError?: string;
  retryAttempted?: boolean;
  retryable?: boolean;
  role: "user" | "assistant";
  blocks: ChatMessageBlock[];
  status?: "streaming" | "complete" | "error";
  /** Client timestamp used while the response is being generated. */
  processStartedAt?: number;
  /** Completed response-processing time in seconds. */
  processDuration?: number;
};

export type SearchSource = {
  id: string;
  title: string;
  domain?: string;
  url?: string;
};

export type ConversationSummary = {
  id: string;
  title: string;
  project_id: string | null;
  title_updated_at: string | null;
  pinned_order: number | null;
  pin_updated_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectSummary = {
  id: string;
  name: string;
  slug: string;
  sort_order: number | null;
  order_updated_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ApiConversationMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoning?: string | null;
  status?: string | null;
  error_message?: string | null;
  model?: string | null;
  reasoning_effort?: string | null;
  speed?: string | null;
  activities?: unknown;
  created_at: string;
  updated_at: string;
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
