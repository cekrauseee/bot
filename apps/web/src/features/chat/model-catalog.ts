import type {
  ChatModelOption,
  ChatProcessingMode,
  ChatReasoningEffort,
} from "./model";

export type ChatModelSelection = {
  model: string;
  reasoningEffort: ChatReasoningEffort;
  processingMode: ChatProcessingMode;
};

export const reasoningEffortLabel = (effort: ChatReasoningEffort) => {
  if (effort === "none") return "None";
  if (effort === "xhigh") return "Extra high";
  if (effort === "max") return "Max";
  return `${effort.charAt(0).toUpperCase()}${effort.slice(1)}`;
};

const reasoningOptions = (
  efforts: ChatReasoningEffort[],
) => efforts.map((value) => ({ value, label: reasoningEffortLabel(value) }));

/**
 * Safe startup catalog used only until `/models` resolves, or if it is unavailable.
 * Runtime responses from the application API always replace this list.
 */
export const FALLBACK_MODEL_CATALOG: ChatModelOption[] = [
  {
    value: "gpt-5.6-sol",
    label: "GPT-5.6 Sol",
    provider: "openai",
    reasoningOptions: reasoningOptions(["none", "low", "medium", "high", "xhigh", "max"]),
    defaultReasoningEffort: "medium",
    processingModes: ["standard", "fast"],
    defaultProcessingMode: "standard",
  },
  {
    value: "gpt-5.6-terra",
    label: "GPT-5.6 Terra",
    provider: "openai",
    reasoningOptions: reasoningOptions(["none", "low", "medium", "high", "xhigh", "max"]),
    defaultReasoningEffort: "medium",
    processingModes: ["standard", "fast"],
    defaultProcessingMode: "standard",
  },
  {
    value: "gpt-5.6-luna",
    label: "GPT-5.6 Luna",
    provider: "openai",
    reasoningOptions: reasoningOptions(["none", "low", "medium", "high", "xhigh", "max"]),
    defaultReasoningEffort: "medium",
    processingModes: ["standard", "fast"],
    defaultProcessingMode: "standard",
  },
  {
    value: "grok-4.6",
    label: "Grok 4.6",
    provider: "xai",
    reasoningOptions: reasoningOptions(["low", "medium", "high", "xhigh"]),
    defaultReasoningEffort: "high",
    processingModes: ["standard"],
    defaultProcessingMode: "standard",
  },
  {
    value: "grok-4.3",
    label: "Grok 4.3",
    provider: "xai",
    reasoningOptions: reasoningOptions(["none", "low", "medium", "high"]),
    defaultReasoningEffort: "medium",
    processingModes: ["standard"],
    defaultProcessingMode: "standard",
  },
];

export function normalizeModelSelection(
  models: ChatModelOption[],
  selection: Partial<ChatModelSelection>,
): ChatModelSelection | undefined {
  const model = models.find((item) => item.value === selection.model) ?? models[0];
  if (!model) return undefined;

  const reasoningEffort = selection.reasoningEffort &&
    model.reasoningOptions.some((option) => option.value === selection.reasoningEffort)
    ? selection.reasoningEffort
    : model.defaultReasoningEffort;
  const processingMode = selection.processingMode &&
    model.processingModes.includes(selection.processingMode)
    ? selection.processingMode
    : model.defaultProcessingMode;

  return { model: model.value, reasoningEffort, processingMode };
}

export const modelSupportsSpeedChoice = (model: ChatModelOption | undefined) =>
  Boolean(model && model.processingModes.length > 1);
