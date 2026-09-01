import { describe, expect, it } from "vitest";

import type { ResponseProcessBlock } from "./response-process-model";
import {
  formatProcessDuration,
  formatProcessLabel,
  responseProcessItems,
} from "./response-process-model";

const blocks: ResponseProcessBlock[] = [
  {
    id: "activity",
    type: "activity",
    status: "working",
    items: [
      {
        id: "search",
        type: "search",
        query: "premium markdown rendering",
      },
    ],
  },
  {
    id: "reasoning",
    type: "reasoning",
    status: "working",
    content: "I am checking the rendering patterns before answering.",
  },
];

describe("response process presentation", () => {
  it("formats the completed process duration without exposing step counts", () => {
    expect(formatProcessDuration(0)).toBe("1s");
    expect(formatProcessDuration(18.4)).toBe("18s");
    expect(formatProcessDuration(75)).toBe("1m 15s");
  });

  it("keeps the processing label geometry consistent across stream completion", () => {
    expect(formatProcessLabel(18, true)).toBe("Processing for 18s");
    expect(formatProcessLabel(18, false)).toBe("Processed for 18s");
  });

  it("preserves the chronological block and item order while working", () => {
    expect(responseProcessItems(blocks, true)).toEqual([
      {
        id: "search",
        type: "search",
        query: "premium markdown rendering",
        moreCount: undefined,
        results: undefined,
      },
      {
        id: "reasoning",
        type: "text",
        content: "I am checking the rendering patterns before answering.",
        format: "markdown",
        status: "streaming",
      },
    ]);
  });

  it("preserves the complete Markdown reasoning when the process finishes", () => {
    expect(responseProcessItems(blocks, false)).toEqual([
      {
        id: "search",
        type: "search",
        query: "premium markdown rendering",
        moreCount: undefined,
        results: undefined,
      },
      {
        id: "reasoning",
        type: "text",
        content: "I am checking the rendering patterns before answering.",
        format: "markdown",
        status: "complete",
      },
    ]);
  });
});
