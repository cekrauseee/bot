import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Message, MessageContent } from "@/components/ui/message"
import { HoverMessageMeta } from "@/features/conversation/components/message-meta"
import { ResponseProcess } from "@/features/conversation/components/response-process"
import type {
  ConversationMessageData,
  ResponseProcessData,
} from "@/features/conversation/model"
import { cn } from "@/lib/utils"

function AssistantMessage({
  content,
  process,
}: {
  content: string
  process?: ResponseProcessData
}) {
  const hasResponse = content.trim().length > 0

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      {process ? (
        <ResponseProcess hasResponse={hasResponse} process={process} />
      ) : null}
      {hasResponse ? (
        <div className="typeset typeset-docs w-full max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
            {content}
          </ReactMarkdown>
        </div>
      ) : null}
    </div>
  )
}

export function ConversationMessage({
  message,
}: {
  message: ConversationMessageData
}) {
  const isUser = message.role === "user"
  const align = isUser ? "end" : "start"

  return (
    <Message
      align={align}
      className={cn((message.createdAt || message.content.trim()) && "pb-7")}
    >
      <MessageContent>
        <Bubble
          align={align}
          variant={isUser ? "secondary" : "ghost"}
          className={cn(!isUser && "w-full max-w-full")}
        >
          <BubbleContent
            className={cn(
              isUser ? "px-4 py-2.5" : "w-full max-w-none overflow-visible"
            )}
          >
            {isUser ? (
              <p className="whitespace-pre-wrap">{message.content}</p>
            ) : (
              <AssistantMessage
                content={message.content}
                process={message.process}
              />
            )}
          </BubbleContent>
        </Bubble>
        <HoverMessageMeta
          align={align}
          copyText={message.content.trim() ? message.content : undefined}
          createdAt={message.createdAt}
        />
      </MessageContent>
    </Message>
  )
}
