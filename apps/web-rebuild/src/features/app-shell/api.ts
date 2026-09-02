import { apiRequest } from "@/lib/api"

export type ConversationSummary = {
  id: string
  title: string
  project_id: string | null
  pinned_order: number | null
  pin_updated_at: string | null
  title_updated_at: string | null
  created_at: string
  updated_at: string
}

export type ProjectSummary = {
  id: string
  name: string
  slug: string
  workspace_path: string
  created_at: string
  updated_at: string
  sort_order: number | null
  order_updated_at: string | null
}

export type ActiveTitleRun = {
  conversation_id: string
  id: string
}

function parseActiveTitleRun(value: unknown): ActiveTitleRun {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The active run catalog was invalid.")
  }

  const run = value as Record<string, unknown>
  if (typeof run.id !== "string" || typeof run.conversation_id !== "string") {
    throw new Error("The active run catalog was invalid.")
  }

  return {
    conversation_id: run.conversation_id,
    id: run.id,
  }
}

export const appShellApi = {
  catalog: async () => {
    const [conversationResult, projectResult, activeRunResult] =
      await Promise.all([
        apiRequest<{ conversations: ConversationSummary[] }>("/conversations"),
        apiRequest<{ projects: ProjectSummary[] }>("/projects"),
        apiRequest<{ runs: unknown[] }>("/agent-runs"),
      ])

    return {
      activeRuns: activeRunResult.runs.map(parseActiveTitleRun),
      conversations: conversationResult.conversations,
      projects: projectResult.projects,
    }
  },
  createProject: (name: string) =>
    apiRequest<ProjectSummary>("/projects", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  deleteConversation: (conversationId: string) =>
    apiRequest<void>(`/conversations/${conversationId}`, { method: "DELETE" }),
  deleteProject: (projectId: string) =>
    apiRequest<void>(`/projects/${projectId}`, { method: "DELETE" }),
  moveConversation: (conversationId: string, projectId: string | null) =>
    apiRequest<ConversationSummary>(
      `/conversations/${conversationId}/project`,
      {
        method: "PATCH",
        body: JSON.stringify({ project_id: projectId }),
      }
    ),
  renameConversation: (conversationId: string, title: string) =>
    apiRequest<ConversationSummary>(`/conversations/${conversationId}`, {
      method: "PATCH",
      body: JSON.stringify({ title }),
    }),
  renameProject: (projectId: string, name: string) =>
    apiRequest<ProjectSummary>(`/projects/${projectId}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),
  reorderPinnedConversations: (conversationIds: string[]) =>
    apiRequest<{ conversations: ConversationSummary[] }>(
      "/conversations/pinned-order",
      {
        method: "PATCH",
        body: JSON.stringify({ conversation_ids: conversationIds }),
      }
    ),
  reorderProjects: (projectIds: string[]) =>
    apiRequest<{ projects: ProjectSummary[] }>("/projects/order", {
      method: "PATCH",
      body: JSON.stringify({ project_ids: projectIds }),
    }),
  setConversationPinned: (conversationId: string, pinned: boolean) =>
    apiRequest<ConversationSummary>(`/conversations/${conversationId}/pin`, {
      method: "PATCH",
      body: JSON.stringify({ pinned }),
    }),
}
