import { Message, MessageContent, MessageGroup } from "./message";
import { MessageScroller } from "./message-scroller";
import { MessageBubble, MessageBubbleContent } from "./message-bubble";
import { MessageBlockRenderer } from "./message-block-renderer";
import type { ChatApprovalDecision, ChatMessage } from "@/features/chat/model";
import { ResponseProcess } from "./response-process";
import { isResponseProcessBlock } from "./response-process-model";
import { cn } from "@/lib/utils";
import { useState } from "react";

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
  const [initialMessageIds] = useState(
    () => new Set(messages.map((message) => message.id)),
  );
  const messageLabel = (role: ChatMessage["role"]) =>
    role === "user" ? "User message" : "Assistant message";

  return (
    <MessageScroller
      label="Conversation"
      navigation="rail"
      navigationLabel="Message navigation"
      className="h-full"
      viewportClassName="h-full min-h-0 px-4 sm:px-8"
      contentClassName="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-end gap-6 py-6 pb-6 sm:py-8"
    >
      <MessageGroup spacing="default" className="gap-7">
        {messages.map((message) => {
          const processBlocks = message.blocks.filter(isResponseProcessBlock);
          const firstProcessIndex = message.blocks.findIndex(
            isResponseProcessBlock,
          );
          const sources = message.blocks.flatMap((messageBlock) =>
            messageBlock.type === "activity"
              ? messageBlock.items.flatMap((item) =>
                  item.type === "search" ? item.results ?? [] : [],
                )
              : [],
          );

          return (
            <Message
              key={message.id}
              from={message.role}
              aria-label={messageLabel(message.role)}
            >
              <MessageContent
                className={cn(
                  message.role === "user"
                    ? "max-w-[88%]"
                    : "gap-5 text-foreground",
                )}
              >
                {message.role === "assistant" &&
                message.processLabel &&
                firstProcessIndex < 0 ? (
                  <ResponseProcess
                    blocks={[]}
                    activeLabel={message.processLabel}
                    duration={message.processDuration}
                  />
                ) : null}
                {message.blocks.map((block, blockIndex) => {
                  if (isResponseProcessBlock(block)) {
                    return blockIndex === firstProcessIndex ? (
                      <ResponseProcess
                        key={`${message.id}-process`}
                        blocks={processBlocks}
                        activeLabel={message.processLabel}
                        duration={message.processDuration}
                      />
                    ) : null;
                  }

                  return message.role === "user" && block.type === "text" ? (
                    <MessageBubble
                      key={block.id}
                      variant="solid"
                      animateIn={!initialMessageIds.has(message.id)}
                    >
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
                      sources={sources}
                    />
                  );
                })}
              </MessageContent>
            </Message>
          );
        })}
      </MessageGroup>
    </MessageScroller>
  );
}
