import {
  Children,
  createContext,
  isValidElement,
  useContext,
  type ReactElement,
  type ReactNode,
} from 'react'
import rehypeKatex from 'rehype-katex'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import 'katex/dist/katex.min.css'

import {
  StreamingResponse,
  type StreamingResponseStatus,
} from '@/components/agents/streaming-response'
import { CodeBlock } from '@/components/agents/code-block'
import type { SearchSource } from '@/features/chat/model'
import { cn } from '@/lib/utils'

type CodeBlockStatus = 'streaming' | 'complete'
type AgentCodeLanguage = 'bash' | 'diff' | 'json' | 'text' | 'tsx' | 'typescript'

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
    <CodeBlock
      code={content}
      language={language(code.props.className)}
      status={status}
      showLineNumbers={false}
      showStatus={false}
      className="my-4 select-none [&_pre]:select-text"
    />
  )
}

const markdownComponents: Components = {
  pre: ({ children }) => <MarkdownPre>{children}</MarkdownPre>,
  code: ({ children, className }) => (
    <code
      className={cn(
        'rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.875em] font-medium text-foreground',
        className,
      )}
    >
      {children}
    </code>
  ),
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="font-medium text-foreground underline decoration-foreground/30 decoration-1 underline-offset-[0.22em] transition-colors hover:decoration-foreground focus-visible:rounded-sm"
    >
      {children}
    </a>
  ),
  h1: ({ children }) => (
    <h2 className="mt-8 scroll-mt-20 text-balance text-xl font-semibold leading-[1.2] tracking-[-0.02em] text-foreground first:mt-0">
      {children}
    </h2>
  ),
  h2: ({ children }) => (
    <h3 className="mt-7 scroll-mt-20 text-balance text-lg font-semibold leading-[1.25] tracking-[-0.014em] text-foreground first:mt-0">
      {children}
    </h3>
  ),
  h3: ({ children }) => (
    <h4 className="mt-6 scroll-mt-20 text-balance text-base font-semibold leading-snug tracking-[-0.008em] text-foreground first:mt-0">
      {children}
    </h4>
  ),
  h4: ({ children }) => (
    <h5 className="mt-5 scroll-mt-20 text-balance text-sm font-semibold leading-snug text-foreground first:mt-0">
      {children}
    </h5>
  ),
  h5: ({ children }) => (
    <h6 className="mt-6 scroll-mt-20 text-balance text-sm font-semibold leading-snug text-foreground first:mt-0">
      {children}
    </h6>
  ),
  h6: ({ children }) => (
    <h6 className="mt-6 text-sm font-semibold leading-snug text-foreground first:mt-0">
      {children}
    </h6>
  ),
  p: ({ children }) => (
    <p className="my-3.5 break-words first:mt-0 last:mb-0">{children}</p>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  em: ({ children }) => <em className="text-foreground/95">{children}</em>,
  del: ({ children }) => (
    <del className="decoration-foreground/45">{children}</del>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-5 border-s-2 border-border ps-4 text-foreground/75 [&_p]:my-0">
      {children}
    </blockquote>
  ),
  ul: ({ children, className }) => (
    <ul
      className={cn(
        'my-4 flex list-disc flex-col gap-1.5 ps-6 marker:text-muted-foreground',
        className,
      )}
    >
      {children}
    </ul>
  ),
  ol: ({ children, className, start }) => (
    <ol
      start={start}
      className={cn(
        'my-4 flex list-decimal flex-col gap-1.5 ps-6 marker:font-medium marker:text-muted-foreground',
        className,
      )}
    >
      {children}
    </ol>
  ),
  li: ({ children, className }) => (
    <li
      className={cn(
        'ps-1 leading-7 [&>p]:my-0 [&>ul]:my-2 [&>ol]:my-2',
        className?.includes('task-list-item') &&
          'flex list-none items-start gap-2 ps-0',
        className,
      )}
    >
      {children}
    </li>
  ),
  input: ({ className, ...props }) => (
    <input
      {...props}
      className={cn(
        'mt-1.5 size-4 shrink-0 rounded border-border accent-foreground',
        className,
      )}
    />
  ),
  table: ({ children }) => (
    <div
      role="region"
      aria-label="Scrollable table"
      tabIndex={0}
      className="my-6 overflow-x-auto rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <table className="w-full min-w-lg border-collapse text-start text-sm leading-6">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="border-b border-border text-foreground">{children}</thead>
  ),
  tbody: ({ children }) => (
    <tbody className="divide-y divide-border/70">{children}</tbody>
  ),
  tr: ({ children }) => <tr>{children}</tr>,
  th: ({ children }) => (
    <th
      scope="col"
      className="px-3 py-2.5 text-start font-semibold first:ps-0 last:pe-0"
    >
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-3 py-3 align-top text-foreground/85 first:ps-0 last:pe-0">
      {children}
    </td>
  ),
  hr: () => <hr className="my-7 border-0 border-t border-border" />,
  img: ({ alt, src }) => (
    <img
      src={src}
      alt={alt ?? ''}
      loading="lazy"
      className="my-6 h-auto max-w-full rounded-xl outline outline-1 -outline-offset-1 outline-foreground/10"
    />
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
      className="max-w-3xl"
      contentClassName="select-text text-sm leading-6 text-foreground/90 [&_.contains-task-list]:ps-0 [&_.katex-display]:my-5 [&_.katex-display]:overflow-x-auto [&_.katex-display]:py-1"
      actionsClassName="mt-1"
    >
      <CodeStatusContext.Provider
        value={status === 'streaming' ? 'streaming' : 'complete'}
      >
        <ReactMarkdown
          skipHtml
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
          components={markdownComponents}
        >
          {content}
        </ReactMarkdown>
      </CodeStatusContext.Provider>
    </StreamingResponse>
  )
}
