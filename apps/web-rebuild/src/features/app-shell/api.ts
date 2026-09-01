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

export const appShellApi = {
  catalog: async () => {
    const [conversationResult, projectResult] = await Promise.all([
      apiRequest<{ conversations: ConversationSummary[] }>("/conversations"),
      apiRequest<{ projects: ProjectSummary[] }>("/projects"),
    ])

    return {
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
