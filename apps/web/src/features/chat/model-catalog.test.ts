import { describe, expect, it } from "vitest";

import type { ChatModelOption } from "./model";
import {
  modelSupportsSpeedChoice,
  normalizeModelSelection,
  reasoningEffortLabel,
} from "./model-catalog";

const models: ChatModelOption[] = [
  {
    value: "gpt-5.6-sol",
    label: "GPT-5.6 Sol",
    provider: "openai",
    reasoningOptions: ["low", "medium", "high", "xhigh", "max"].map((value) => ({
      value: value as "low" | "medium" | "high" | "xhigh" | "max",
      label: reasoningEffortLabel(value as "low" | "medium" | "high" | "xhigh" | "max"),
    })),
    defaultReasoningEffort: "medium",
    processingModes: ["standard", "fast"],
    defaultProcessingMode: "standard",
  },
  {
    value: "grok-4.3",
    label: "Grok 4.3",
    provider: "xai",
    reasoningOptions: ["none", "low", "medium", "high"].map((value) => ({
      value: value as "none" | "low" | "medium" | "high",
      label: reasoningEffortLabel(value as "none" | "low" | "medium" | "high"),
    })),
    defaultReasoningEffort: "medium",
    processingModes: ["standard"],
    defaultProcessingMode: "standard",
  },
];

describe("model capability selection", () => {
  it("uses each selected model's supported effort and processing mode", () => {
    expect(normalizeModelSelection(models, {
      model: "gpt-5.6-sol",
      reasoningEffort: "xhigh",
      processingMode: "fast",
    })).toEqual({
      model: "gpt-5.6-sol",
      reasoningEffort: "xhigh",
      processingMode: "fast",
    });
  });

  it("resets invalid saved values to the model defaults", () => {
    expect(normalizeModelSelection(models, {
      model: "grok-4.3",
      reasoningEffort: "max",
      processingMode: "fast",
    })).toEqual({
      model: "grok-4.3",
      reasoningEffort: "medium",
      processingMode: "standard",
    });
  });

  it("only exposes the speed choice for multi-mode models", () => {
    expect(modelSupportsSpeedChoice(models[0])).toBe(true);
    expect(modelSupportsSpeedChoice(models[1])).toBe(false);
  });
});
