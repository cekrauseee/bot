export type ChatWorkspaceModeInput = {
  activeConversationId?: string
  messageCount: number
  streaming: boolean
  turnError: string
}

export const chatWorkspaceMode = ({
  activeConversationId,
}: ChatWorkspaceModeInput) => (
  !activeConversationId
    ? 'centered'
    : 'transcript'
)
