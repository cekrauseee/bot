import type { ConversationSummary, ProjectSummary } from './model'

export function conversationPath(
  conversation: Pick<ConversationSummary, 'id' | 'project_id'>,
  projects: ProjectSummary[],
) {
  const project = projects.find((item) => item.id === conversation.project_id)
  return conversationPathForRoute(conversation.id, project?.slug)
}

export function conversationPathForRoute(id: string, projectSlug?: string) {
  return projectSlug
    ? `/projects/${encodeURIComponent(projectSlug)}/${id}`
    : `/conversations/${id}`
}

export function deletedActiveConversationPath(
  activeConversationId: string | undefined,
  deletedConversationIds: string[],
) {
  return activeConversationId && deletedConversationIds.includes(activeConversationId)
    ? '/'
    : undefined
}
