import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller"
import { ConversationMessage } from "@/features/conversation/components/conversation-message"
import type { ConversationMessageData } from "@/features/conversation/model"
import type { CSSProperties } from "react"

const composerScrollMask = {
  maskImage:
    "linear-gradient(to bottom, black 0, black calc(100% - var(--composer-dock-height, 4rem) + 0.75rem), transparent calc(100% - var(--composer-dock-height, 4rem) + 1.75rem))",
  WebkitMaskImage:
    "linear-gradient(to bottom, black 0, black calc(100% - var(--composer-dock-height, 4rem) + 0.75rem), transparent calc(100% - var(--composer-dock-height, 4rem) + 1.75rem))",
} satisfies CSSProperties

export function ConversationView({
  messages,
}: {
  messages: readonly ConversationMessageData[]
}) {
  return (
    <section aria-labelledby="conversation-title" className="size-full min-h-0">
      <MessageScrollerProvider defaultScrollPosition="start">
        <MessageScroller>
          <MessageScrollerViewport
            preserveScrollOnPrepend={false}
            className="px-4 [overflow-anchor:none]"
            style={composerScrollMask}
          >
            <MessageScrollerContent
              role="list"
              aria-label="Messages"
              className="mx-auto w-full max-w-3xl gap-1 pt-8 pb-[calc(var(--composer-dock-height,4rem)+2rem)] sm:pt-10 sm:pb-[calc(var(--composer-dock-height,4rem)+2.5rem)]"
            >
              {messages.map((message) => (
                <MessageScrollerItem
                  key={message.id}
                  messageId={message.id}
                  role="listitem"
                  className="-mx-1 w-[calc(100%+0.5rem)] px-1"
                >
                  <ConversationMessage message={message} />
                </MessageScrollerItem>
              ))}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton className="data-[direction=end]:bottom-[calc(var(--composer-dock-height,4rem)+1rem)]" />
        </MessageScroller>
      </MessageScrollerProvider>
    </section>
  )
}
