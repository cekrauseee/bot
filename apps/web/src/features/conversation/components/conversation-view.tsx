import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller"
import { ConversationMessage } from "@/features/conversation/components/conversation-message"
import { useTurnSpacer } from "@/features/conversation/hooks/use-turn-spacer"
import type {
  BrowserProjection,
  ConversationMessageData,
} from "@/features/conversation/model"
import type { CSSProperties } from "react"

const composerScrollMask = {
  maskImage:
    "linear-gradient(to bottom, black 0, black calc(100% - var(--composer-dock-height, 4rem) + 0.75rem), transparent calc(100% - var(--composer-dock-height, 4rem) + 1.75rem))",
  WebkitMaskImage:
    "linear-gradient(to bottom, black 0, black calc(100% - var(--composer-dock-height, 4rem) + 0.75rem), transparent calc(100% - var(--composer-dock-height, 4rem) + 1.75rem))",
} satisfies CSSProperties

export function ConversationView({
  messages,
  activeAssistantId,
  browserProjection,
  onTurnSpacerAnchorConsumed,
  turnSpacerAnchorId,
}: {
  messages: readonly ConversationMessageData[]
  activeAssistantId?: string
  browserProjection?: BrowserProjection | null
  onTurnSpacerAnchorConsumed?: (anchorId: string) => void
  turnSpacerAnchorId?: string
}) {
  const { clearSpacer, contentRef, handleScroll, viewportRef } = useTurnSpacer(
    turnSpacerAnchorId,
    onTurnSpacerAnchorConsumed
  )

  return (
    <section aria-labelledby="conversation-title" className="size-full min-h-0">
      <MessageScrollerProvider defaultScrollPosition="end">
        <MessageScroller>
          <MessageScrollerViewport
            ref={viewportRef}
            preserveScrollOnPrepend={false}
            onScroll={handleScroll}
            className="px-4 [overflow-anchor:none]"
            style={composerScrollMask}
          >
            <MessageScrollerContent
              ref={contentRef}
              role="list"
              aria-label="Messages"
              className="mx-auto w-full max-w-3xl gap-1 pt-8 pb-[calc(var(--composer-dock-height,4rem)+2rem)] sm:pt-10 sm:pb-[calc(var(--composer-dock-height,4rem)+2.5rem)]"
            >
              {messages.map((message) => (
                <MessageScrollerItem
                  key={message.id}
                  messageId={message.id}
                  role="listitem"
                  className="w-full"
                >
                  <ConversationMessage
                    browserProjection={
                      message.id === activeAssistantId
                        ? browserProjection
                        : undefined
                    }
                    message={message}
                    streaming={message.id === activeAssistantId}
                  />
                </MessageScrollerItem>
              ))}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton
            onClick={clearSpacer}
            className="data-[direction=end]:bottom-[calc(var(--composer-dock-height,4rem)+1rem)]"
          />
        </MessageScroller>
      </MessageScrollerProvider>
    </section>
  )
}
