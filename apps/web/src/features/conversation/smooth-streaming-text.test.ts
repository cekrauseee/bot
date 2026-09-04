import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import ReactMarkdown from "react-markdown"
import { describe, expect, it } from "vitest"

import {
  rehypeStreamingWords,
  splitStreamingDelta,
} from "@/features/conversation/smooth-streaming-text"

describe("smooth streaming text", () => {
  it("queues one word at a time without changing the delta", () => {
    const delta = "  Render every\nword smoothly.  "
    const words = splitStreamingDelta(delta)

    expect(words).toEqual(["  Render", " every", "\nword", " smoothly.  "])
    expect(words.join("")).toBe(delta)
  })

  it("keeps whitespace-only deltas intact", () => {
    expect(splitStreamingDelta(" \n ")).toEqual([" \n "])
  })

  it("marks only words after the animation boundary", () => {
    const tree = {
      type: "root",
      children: [
        {
          type: "element",
          tagName: "p",
          children: [
            {
              type: "text",
              value: "Existing new words",
              position: { start: { offset: 2 } },
            },
          ],
        },
      ],
    }

    rehypeStreamingWords({ animateFromOffset: 11 })(tree)

    const paragraph = tree.children[0]
    expect(paragraph.children).toMatchObject([
      {
        properties: { className: ["streaming-word"] },
        children: [{ value: "Existing" }],
      },
      { value: " " },
      {
        properties: {
          className: ["streaming-word", "streaming-word-animated"],
        },
        children: [{ value: "new" }],
      },
      { value: " " },
      {
        properties: {
          className: ["streaming-word", "streaming-word-animated"],
        },
        children: [{ value: "words" }],
      },
    ])
  })

  it("preserves Markdown structure while wrapping streamed words", () => {
    const markup = renderToStaticMarkup(
      createElement(ReactMarkdown, {
        children: "Existing **new words**",
        rehypePlugins: [[rehypeStreamingWords, { animateFromOffset: 11 }]],
      })
    )

    expect(markup).toContain('<span class="streaming-word">Existing</span>')
    expect(markup).toContain(
      '<strong><span class="streaming-word streaming-word-animated">new</span>'
    )
    expect(markup).toContain(
      '<span class="streaming-word streaming-word-animated">words</span></strong>'
    )
  })
})
