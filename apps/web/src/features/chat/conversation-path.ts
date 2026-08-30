import type { ConversationSummary, ProjectSummary } from './model'

export function conversationPath(
  conversation: Pick<ConversationSummary, 'id' | 'project_id'>,
  projects: ProjectSummary[],
) {
  const project = projects.find((item) => item.id === conversation.project_id)
  return project
    ? `/projects/${encodeURIComponent(project.slug)}/${conversation.id}`
    : `/conversations/${conversation.id}`
}
