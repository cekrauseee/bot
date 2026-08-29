import {
  Children,
  createContext,
  isValidElement,
  lazy,
  Suspense,
  useContext,
  type ReactElement,
  type ReactNode,
} from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

import {
  StreamingResponse,
  type StreamingResponseStatus,
} from '@/components/agents/streaming-response'
import type { SearchSource } from '@/features/chat/model'

type CodeBlockStatus = 'streaming' | 'complete'
type AgentCodeLanguage = 'bash' | 'diff' | 'json' | 'text' | 'tsx' | 'typescript'

const BeUICodeBlock = lazy(async () => {
  const module = await import('@/components/agents/code-block')
  return { default: module.CodeBlock }
})

const CodeStatusContext = createContext<CodeBlockStatus>('complete')

const language = (className?: string): AgentCodeLanguage => {
  const name = className?.match(/language-([^\s]+)/)?.[1]?.toLowerCase()
  if (name === 'bash' || name === 'sh' || name === 'shell') return 'bash'
  if (name === 'diff') return 'diff'
  if (name === 'json') return 'json'
  if (name === 'tsx' || name === 'jsx') return 'tsx'
  if (name === 'typescript' || name === 'ts') return 'typescript'
  return 'text'
}

function MarkdownPre({ children }: { children?: ReactNode }) {
  const status = useContext(CodeStatusContext)
  const child = Children.only(children)
  if (!isValidElement(child)) return <pre>{children}</pre>
  const code = child as ReactElement<{ children?: ReactNode; className?: string }>
  const content = String(code.props.children ?? '').replace(/\n$/, '')
  return (
    <Suspense fallback={<pre className="my-3 overflow-x-auto"><code>{content}</code></pre>}>
      <BeUICodeBlock
        code={content}
        language={language(code.props.className)}
        status={status}
        className="my-3"
      />
    </Suspense>
  )
}

const markdownComponents: Components = {
  pre: ({ children }) => <MarkdownPre>{children}</MarkdownPre>,
  code: ({ children, className }) => (
    <code className={className}>{children}</code>
  ),
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer noopener">
      {children}
    </a>
  ),
  h1: ({ children }) => (
    <h2 className="mt-5 text-base font-medium leading-tight text-foreground first:mt-0">
      {children}
    </h2>
  ),
  h2: ({ children }) => (
    <h3 className="mt-4 text-sm font-semibold leading-tight text-foreground first:mt-0">
      {children}
    </h3>
  ),
  h3: ({ children }) => (
    <h4 className="mt-4 text-sm font-medium leading-tight text-foreground first:mt-0">
      {children}
    </h4>
  ),
}

export function MarkdownResponse({
  content,
  status,
  sources,
}: {
  content: string
  status: StreamingResponseStatus
  sources: SearchSource[]
}) {
  return (
    <StreamingResponse
      status={status}
      copyText={content}
      sources={sources}
      announce={false}
      className="max-w-xl px-1"
    >
      <CodeStatusContext.Provider
        value={status === 'streaming' ? 'streaming' : 'complete'}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {content}
        </ReactMarkdown>
      </CodeStatusContext.Provider>
    </StreamingResponse>
  )
}
