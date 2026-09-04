import "@/features/conversation/smooth-streaming-text.css"

export const STREAMING_WORD_INTERVAL_MS = 28

export function splitStreamingDelta(delta: string) {
  const parts = delta.match(/\s+|\S+/gu)
  if (!parts) return []

  const words: string[] = []
  let whitespace = ""

  for (const part of parts) {
    if (/^\s+$/u.test(part)) {
      whitespace += part
      continue
    }

    words.push(whitespace + part)
    whitespace = ""
  }

  if (whitespace) {
    if (words.length) words[words.length - 1] += whitespace
    else words.push(whitespace)
  }

  return words
}

type MarkdownPosition = {
  start?: {
    offset?: number
  }
}

type MarkdownNode = {
  children?: MarkdownNode[]
  position?: MarkdownPosition
  properties?: Record<string, unknown>
  tagName?: string
  type: string
  value?: string
}

type StreamingWordsOptions = {
  animateFromOffset: number
}

function splitTextNode(
  node: MarkdownNode,
  { animateFromOffset }: StreamingWordsOptions
) {
  const value = node.value ?? ""
  const matches = [...value.matchAll(/\S+/gu)]
  if (!matches.length) return [node]

  const children: MarkdownNode[] = []
  const sourceOffset = node.position?.start?.offset
  let cursor = 0

  for (const match of matches) {
    const index = match.index
    if (index > cursor) {
      children.push({ type: "text", value: value.slice(cursor, index) })
    }

    const word = match[0]
    const wordOffset =
      sourceOffset === undefined ? undefined : sourceOffset + index
    const animated =
      wordOffset === undefined
        ? animateFromOffset === 0
        : wordOffset >= animateFromOffset

    children.push({
      type: "element",
      tagName: "span",
      properties: {
        className: animated
          ? ["streaming-word", "streaming-word-animated"]
          : ["streaming-word"],
      },
      children: [{ type: "text", value: word }],
    })
    cursor = index + word.length
  }

  if (cursor < value.length) {
    children.push({ type: "text", value: value.slice(cursor) })
  }

  return children
}

export function rehypeStreamingWords(options: StreamingWordsOptions) {
  return (tree: MarkdownNode) => {
    const visit = (node: MarkdownNode) => {
      if (!node.children) return

      node.children = node.children.flatMap((child) => {
        if (child.type === "text") return splitTextNode(child, options)
        visit(child)
        return child
      })
    }

    visit(tree)
  }
}
