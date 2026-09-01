import { Message, MessageContent, MessageGroup } from "./message";
import { MessageScroller } from "./message-scroller";
import { MessageBubble, MessageBubbleContent } from "./message-bubble";
import { MessageBlockRenderer } from "./message-block-renderer";
import type { ChatApprovalDecision, ChatMessage } from "@/features/chat/model";
import { ResponseStatus } from './response-status';
import { isResponseProcessBlock } from "./response-process-model";
import { cn } from "@/lib/utils";
import { memo, useState, type Ref } from "react";
import { useHistoryEntrance } from '../../hooks/use-history-entrance';
import type { ConversationEntry } from '../../motion/conversation-entry';
import { HoverMessageMeta } from './message-meta';

type MessageRowProps = {
  message: ChatMessage;
  animateBubble: boolean;
  onRetry?: () => void;
  onReload?: () => void;
  retryPending?: boolean;
  retryDisabled?: boolean;
  onApprovalDecision?: (blockId: string, decision: ChatApprovalDecision) => void;
};

const ChatMessageRow = memo(function ChatMessageRow({
  message, animateBubble, onRetry, onReload, onApprovalDecision, retryPending, retryDisabled,
}: MessageRowProps) {
  const sources = message.blocks.flatMap((block) => block.type === 'activity'
    ? block.items.flatMap((item) => item.type === 'search' ? item.results ?? [] : [])
    : []);
  const renderKey = message.renderKey ?? message.id;
  const messageLabel = message.role === 'user' ? 'User message' : 'Assistant message';
  const copyText = message.blocks
    .filter((block) => block.type === 'text')
    .map((block) => block.content)
    .join('\n\n');
  const lastTextBlockIndex = message.blocks.findLastIndex((block) => block.type === 'text');
  const content = (
      <MessageContent
        className={cn(
          "relative",
          message.role === "user"
            ? "max-w-[88%]"
            : "gap-5 text-foreground",
        )}
      >
        {message.role === "assistant" ? (
          <ResponseStatus
            message={message}
            onRetry={onRetry}
            onReload={onReload}
            retryPending={retryPending}
            retryDisabled={retryDisabled}
          />
        ) : null}
        {message.blocks.map((block, blockIndex) => {
          if (isResponseProcessBlock(block)) {
            return null;
          }

          return message.role === "user" && block.type === "text" ? (
            <MessageBubble
              key={`${renderKey}:${blockIndex}`}
              variant="solid"
              animateIn={animateBubble}
            >
              <MessageBubbleContent className="max-w-full select-text text-sm leading-5">
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
              createdAt={blockIndex === lastTextBlockIndex ? message.createdAt : undefined}
            />
          );
        })}
        {message.role === 'user' && copyText ? (
          <HoverMessageMeta copyText={copyText} createdAt={message.createdAt} />
        ) : null}
      </MessageContent>
  );
  const common = { 'data-scroll-boundary': true, 'data-message-key': renderKey, from: message.role, 'aria-label': messageLabel, animateOut: false } as const;
  return <Message {...common}>{content}</Message>;
});

export function ChatMessageList({
  messages,
  onApprovalDecision,
  revealHistory = false,
  viewportRef,
  onRetryTurn,
  onReloadConversation,
  canRetryTurn = false,
  entry,
  conversationKey,
  anchorMessageKey,
  retryingMessageKey,
}: {
  entry?: ConversationEntry;
  conversationKey?: string;
  anchorMessageKey?: string;
  retryingMessageKey?: string;
  messages: ChatMessage[];
  revealHistory?: boolean;
  viewportRef?: Ref<HTMLElement>;
  onRetryTurn?: () => void;
  onReloadConversation?: () => void;
  canRetryTurn?: boolean;
  onApprovalDecision?: (
    blockId: string,
    decision: ChatApprovalDecision,
  ) => void;
}) {
  const revealVisibleHistory = useHistoryEntrance(revealHistory, entry, conversationKey);
  const [initialMessageIds] = useState(
    () => new Set(messages.map((message) => message.renderKey ?? message.id)),
  );


  return (
    <MessageScroller
      followOutput={false}
      anchorMessageKey={anchorMessageKey}
      viewportRef={viewportRef}
      onInitialPosition={revealVisibleHistory}
      data-history-pending={revealHistory ? "" : undefined}
      label="Conversation"
      busy={messages.at(-1)?.status === 'streaming'}
      navigation="rail"
      navigationLabel="Message navigation"
      className="h-full [&[data-history-pending]_[data-slot=message]]:opacity-0!"
      viewportClassName="h-full min-h-0 px-4 sm:px-8"
      contentClassName="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-end pt-6 pb-10 sm:pt-8 sm:pb-12"
    >
      <MessageGroup spacing="default" className="shrink-0 gap-7">
        {messages.map((message) => {
          const key = message.renderKey ?? message.id;
          const latest = message.id === messages.at(-1)?.id;
          return (
            <ChatMessageRow
              key={key}
              message={message}
              animateBubble={!initialMessageIds.has(key)}
              onRetry={latest && message.retryable !== false ? onRetryTurn : undefined}
              retryPending={key === retryingMessageKey}
              retryDisabled={latest ? !canRetryTurn : undefined}
              onReload={latest ? onReloadConversation : undefined}
              onApprovalDecision={onApprovalDecision}
            />
          );
        })}
      </MessageGroup>
    </MessageScroller>
  );
}
