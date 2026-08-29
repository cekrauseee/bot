import { Message, MessageContent, MessageGroup } from "./message";
import { MessageScroller } from "./message-scroller";
import { MessageBubble, MessageBubbleContent } from "./message-bubble";
import { MessageBlockRenderer } from "./message-block-renderer";
import type { ChatApprovalDecision, ChatMessage } from "@/features/chat/model";

export function ChatMessageList({
  messages,
  onApprovalDecision,
}: {
  messages: ChatMessage[];
  onApprovalDecision?: (
    blockId: string,
    decision: ChatApprovalDecision,
  ) => void;
}) {
  const messageLabel = (role: ChatMessage["role"]) =>
    role === "user" ? "User message" : "Assistant message";

  return (
    <MessageScroller
      label="Conversation"
      navigation="rail"
      navigationLabel="Message navigation"
      className="h-full"
      viewportClassName="h-full min-h-0 px-4 sm:px-8"
      contentClassName="mx-auto flex min-h-full w-full max-w-2xl flex-col justify-end gap-6 py-6 pb-6 sm:py-8"
    >
      <MessageGroup spacing="default" className="gap-5">
        {messages.map((message) => (
          <Message
            key={message.id}
            from={message.role}
            aria-label={messageLabel(message.role)}
          >
            <MessageContent
              className={
                message.role === "user" ? "max-w-[88%]" : "text-foreground"
              }
            >
              {message.blocks.map((block) =>
                message.role === "user" && block.type === "text" ? (
                  <MessageBubble key={block.id} variant="tint" animateIn>
                    <MessageBubbleContent className="max-w-full text-sm leading-5">
                      {block.content}
                    </MessageBubbleContent>
                  </MessageBubble>
                ) : (
                  <MessageBlockRenderer
                    key={block.id}
                    block={block}
                    onApprovalDecision={onApprovalDecision}
                    responseStatus={message.status}
                    sources={message.blocks.flatMap((messageBlock) =>
                      messageBlock.type === "activity"
                        ? messageBlock.items.flatMap((item) =>
                            item.type === "search" ? item.results ?? [] : [])
                        : [])}
                  />
                ),
              )}
            </MessageContent>
          </Message>
        ))}
      </MessageGroup>
    </MessageScroller>
  );
}
