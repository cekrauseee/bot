export type ProcessSearchSource = {
  domain?: string
  id: string
  title: string
  url?: string
}

export type ProcessActivityStatus = "completed" | "failed" | "in_progress"

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
      status?: ProcessActivityStatus
      type: "search"
    }
  | {
      action: string
      additions?: number
      deletions?: number
      detail?: string
      id: string
      status?: ProcessActivityStatus
      target?: string
      type: "tool"
    }
  | {
      detail?: string
      id: string
      name: string
      status?: ProcessActivityStatus
      type: "skill"
    }
  | {
      detail?: string
      id: string
      kind: string
      label: string
      status?: ProcessActivityStatus
      type: "trace"
    }

export type ResponseProcessData = {
  activities: readonly ProcessActivity[]
  browserProjection?: BrowserProjection | null
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

export type BrowserFrame = {
  base64: string
  capturedAt: string
  mimeType: "image/png" | "image/jpeg"
}

export type BrowserProjection = {
  control: "agent" | "user" | "locked"
  state: "launching" | "live" | "awaiting_user" | "stopped" | "failed"
  url?: string
  message?: string
  leaseExpiresAt?: string | null
}
