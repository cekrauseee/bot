import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it, vi } from "vitest";
import { ResponseProcess } from "./response-process";

vi.stubGlobal("React", React);
afterAll(() => vi.unstubAllGlobals());

describe("response process header", () => {
  it("keeps a step-free result as the same static label without a disclosure", () => {
    const markup = renderToStaticMarkup(
      React.createElement(ResponseProcess, { blocks: [], duration: 4 }),
    );

    expect(markup).toContain("Processed for 4s");
    expect(markup).not.toContain("<button");
    expect(markup).not.toContain("aria-controls=");
    expect(markup).not.toContain("<svg");
  });

  it("adds the disclosure semantics only when a real process step exists", () => {
    const markup = renderToStaticMarkup(
      React.createElement(ResponseProcess, {
        blocks: [{
          id: "activity",
          type: "activity",
          status: "complete",
          items: [{ id: "step", type: "step", label: "Checked the request" }],
        }],
        duration: 4,
      }),
    );

    expect(markup).toContain("Processed for 4s");
    expect(markup).toContain("<button");
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain("<svg");
    expect(markup).toContain("bg-border/70");
  });

  it("keeps the separator before the active chain and after the completed disclosure", () => {
    const process = [{
      id: "activity",
      type: "activity" as const,
      status: "working" as const,
      items: [{ id: "step", type: "step" as const, label: "Checked the request" }],
    }];
    const working = renderToStaticMarkup(
      React.createElement(ResponseProcess, { blocks: process, working: true }),
    );
    const complete = renderToStaticMarkup(
      React.createElement(ResponseProcess, { blocks: process, duration: 4 }),
    );

    expect(working.indexOf("Processing for")).toBeLessThan(working.indexOf("bg-border/70"));
    expect(working.indexOf("bg-border/70")).toBeLessThan(working.indexOf("Checked the request"));
    expect(working).toContain("bg-border/70 order-1");
    expect(complete.indexOf("Processed for")).toBeLessThan(complete.indexOf("bg-border/70"));
    expect(complete).toContain("bg-border/70 order-2");
    expect(complete).not.toContain("Checked the request");
  });

  it("renders streamed reasoning as Markdown without making the active label interactive", () => {
    const markup = renderToStaticMarkup(
      React.createElement(ResponseProcess, {
        blocks: [{
          id: "reasoning",
          type: "reasoning",
          status: "working",
          content: "**Exploring candidates and plans**\n\nChecking the official sources.",
        }],
        working: true,
      }),
    );

    expect(markup).toContain("<strong");
    expect(markup).toContain("Exploring candidates and plans");
    expect(markup).not.toContain("**Exploring candidates and plans**");
    expect(markup).not.toContain("<button");
    expect(markup).not.toContain('aria-label="Scroll to bottom"');
  });
});
