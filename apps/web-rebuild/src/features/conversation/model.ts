export type ProcessSearchSource = {
  domain?: string
  id: string
  title: string
  url?: string
}

export type ProcessActivity =
  | {
      id: string
      type: "step"
      label: string
      meta?: string
      status?: "active" | "complete" | "pending"
    }
  | {
      content: string
      id: string
      lastSequence?: number | string
      type: "text"
    }
  | {
      id: string
      moreCount?: number
      query: string
      results?: readonly ProcessSearchSource[]
      type: "search"
    }
  | {
      action: string
      additions?: number
      deletions?: number
      id: string
      target: string
      type: "tool"
    }
  | {
      detail?: string
      id: string
      kind: string
      label: string
      type: "trace"
    }

export type ResponseProcessData = {
  activities: readonly ProcessActivity[]
  durationSeconds: number
  startedAt?: number
  status: "processed" | "processing"
}

export type ConversationMessageData = {
  content: string
  createdAt?: string
  id: string
  process?: ResponseProcessData
  role: "assistant" | "user"
}
