import { useMemo, type ComponentProps } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Message, MessageContent } from "@/components/ui/message"
import { HoverMessageMeta } from "@/features/conversation/components/message-meta"
import { ResponseProcess } from "@/features/conversation/components/response-process"
import { useSmoothStreamedContent } from "@/features/conversation/hooks/use-smooth-streamed-content"
import type {
  BrowserProjection,
  ConversationMessageData,
  ResponseProcessData,
} from "@/features/conversation/model"
import { rehypeStreamingWords } from "@/features/conversation/smooth-streaming-text"
import { cn } from "@/lib/utils"

function AssistantMessage({
  browserProjection,
  content,
  process,
  streaming,
}: {
  content: string
  process?: ResponseProcessData
  browserProjection?: BrowserProjection | null
  streaming: boolean
}) {
  const { animateFromOffset, animationEnabled, displayedContent } =
    useSmoothStreamedContent(content, streaming, { animateInitial: true })
  const rehypePlugins = useMemo<
    NonNullable<ComponentProps<typeof ReactMarkdown>["rehypePlugins"]>
  >(
    () =>
      animationEnabled ? [[rehypeStreamingWords, { animateFromOffset }]] : [],
    [animateFromOffset, animationEnabled]
  )
  const hasResponse = displayedContent.trim().length > 0
  const responseBody = hasResponse ? (
    <div className="typeset typeset-docs w-full max-w-none text-base select-text">
      <ReactMarkdown
        rehypePlugins={rehypePlugins}
        remarkPlugins={[remarkGfm]}
        skipHtml
      >
        {displayedContent}
      </ReactMarkdown>
    </div>
  ) : null

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      {process ? (
        <ResponseProcess
          hasResponse={hasResponse}
          process={{ ...process, browserProjection }}
        >
          {responseBody}
        </ResponseProcess>
      ) : null}
      {!process ? responseBody : null}
    </div>
  )
}

export function ConversationMessage({
  browserProjection,
  message,
  streaming = false,
}: {
  message: ConversationMessageData
  browserProjection?: BrowserProjection | null
  streaming?: boolean
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
              <p className="text-base whitespace-pre-wrap select-text">
                {message.content}
              </p>
            ) : (
              <AssistantMessage
                content={message.content}
                process={message.process}
                browserProjection={browserProjection}
                streaming={streaming}
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
