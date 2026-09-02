type ConversationPlaceholderProps = {
  description?: string
  title: string
}

export function ConversationPlaceholder({
  description = "Conversation content will appear here.",
  title,
}: ConversationPlaceholderProps) {
  return (
    <div className="flex size-full items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <h2 className="text-base font-medium">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}
