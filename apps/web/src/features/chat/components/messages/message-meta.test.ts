import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it, vi } from "vitest";

import {
  StreamingResponse,
  type StreamingResponseProps,
} from "@/components/agents/streaming-response";
import { ChatMessageList } from "./chat-message-list";
import { formatMessageTimestamp } from "./message-time";

vi.stubGlobal("React", React);
afterAll(() => vi.unstubAllGlobals());

const createdAt = "2026-08-31T23:32:00.000Z";

describe("message metadata", () => {
  it("formats the localized weekday and time", () => {
    expect(formatMessageTimestamp(createdAt, "en-GB", "UTC")).toBe(
      "Monday, 23:32",
    );
    expect(formatMessageTimestamp("not-a-date", "en-GB", "UTC")).toBeNull();
  });

  it("renders spaced hover metadata for user messages", () => {
    const markup = renderToStaticMarkup(React.createElement(ChatMessageList, {
      messages: [{
        id: "user",
        role: "user",
        status: "complete",
        createdAt,
        blocks: [{ id: "user-text", type: "text", content: "Hello" }],
      }],
    }));

    expect(markup).toContain('data-slot="message-hover-meta"');
    expect(markup).toContain("gap-1.5");
    expect(markup).toContain("pt-1.5");
    expect(markup).toContain("hover:opacity-100");
    expect(markup).toContain('data-slot="message-copy-action"');
    expect(markup).toContain('aria-label="Copy message"');
    expect(markup).toContain(`dateTime="${createdAt}"`);
  });

  it("uses the shared copy action and compact timestamp for assistant messages", () => {
    const markup = renderToStaticMarkup(React.createElement(ChatMessageList, {
      messages: [{
        id: "assistant",
        role: "assistant",
        status: "complete",
        createdAt,
        blocks: [{ id: "assistant-text", type: "text", content: "Hello back" }],
      }],
    }));

    expect(markup).toContain('aria-label="Copy response"');
    expect(markup).toContain('data-slot="message-copy-action"');
    expect(markup).not.toContain('aria-label="Helpful"');
    expect(markup).not.toContain('aria-label="Not helpful"');
    expect(markup).toContain("text-xs");
    expect(markup).toContain("leading-4");
    expect(markup).toContain("pointer-events-auto");
    expect(markup).toContain("opacity-0");
    expect(markup).toContain("transition-opacity");
    expect(markup).not.toContain("transition-[opacity,transform]");
    expect(markup).toContain("group-hover/message:opacity-100");
    expect(markup).toContain("group-has-[:focus-visible]/message:opacity-100");
    expect(markup).not.toContain("group-focus-within/message");
    expect(markup).toContain(`dateTime="${createdAt}"`);
  });

  it("keeps message actions visible while sources are expanded", () => {
    const props = {
      status: "complete",
      defaultSourcesOpen: true,
      sources: [{ id: "source", title: "Source", url: "https://example.com" }],
      actionsClassName: "pointer-events-none translate-y-0.5 opacity-0",
    } satisfies Omit<StreamingResponseProps, "children">;
    const markup = renderToStaticMarkup(React.createElement(
      StreamingResponse,
      props as StreamingResponseProps,
      "Answer",
    ));

    expect(markup).toContain('data-actions-expanded="true"');
    expect(markup).toContain("pointer-events-auto");
    expect(markup).toContain("translate-y-0");
    expect(markup).toContain("opacity-100");
  });
});
