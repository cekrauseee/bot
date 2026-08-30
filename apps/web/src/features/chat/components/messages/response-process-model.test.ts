import { describe, expect, it } from "vitest";

import type { ResponseProcessBlock } from "./response-process-model";
import {
  formatProcessDuration,
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

  it("shows reasoning summaries as transient process messages", () => {
    expect(responseProcessItems(blocks, true)).toEqual([
      {
        id: "reasoning",
        type: "text",
        content: "I am checking the rendering patterns before answering.",
      },
      {
        id: "search",
        type: "search",
        query: "premium markdown rendering",
        moreCount: undefined,
        results: undefined,
      },
    ]);
  });

  it("discards reasoning text but preserves the completed operation", () => {
    expect(responseProcessItems(blocks, false)).toEqual([
      {
        id: "reasoning",
        type: "step",
        label: "Reasoned through the response",
        status: "complete",
      },
      {
        id: "search",
        type: "search",
        query: "premium markdown rendering",
        moreCount: undefined,
        results: undefined,
      },
    ]);
  });
});
