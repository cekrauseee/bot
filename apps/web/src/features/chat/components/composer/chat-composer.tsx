import { OpenAIIcon } from "@/components/icons/openai-icon";
import { XIcon } from "@/components/icons/x-icon";
import { PromptInput } from "./prompt-input";
import { ReasoningEffort } from "@/features/chat/components/reasoning-effort";
import { SpeedToggle } from "@/features/chat/components/speed-toggle";
import type {
  ChatModelOption,
  ChatReasoningEffort,
  ChatTodo,
} from "@/features/chat/model";
import { modelSupportsSpeedChoice } from "@/features/chat/model-catalog";
import { cn } from "@/lib/utils";
import { TaskPlanBadge } from "../tasks/task-plan-badge";

export type ChatComposerProps = {
  plan: ChatTodo[];
  models: ChatModelOption[];
  model: string;
  reasoningEffort: ChatReasoningEffort;
  fastMode: boolean;
  loading: boolean;
  onSubmit?: (value: string, model?: string) => void | Promise<void>;
  onStop?: () => void;
  onModelChange?: (model: string) => void;
  onReasoningChange: (value: ChatReasoningEffort) => void;
  onSpeedChange: (value: boolean) => void;
  centered?: boolean;
};

export function ChatComposer({
  plan,
  models,
  model,
  reasoningEffort,
  fastMode,
  loading,
  onSubmit,
  onStop,
  onModelChange,
  onReasoningChange,
  onSpeedChange,
  centered = false,
}: ChatComposerProps) {
  const selectedModel = models.find((option) => option.value === model);

  return (
    <div className={cn(
      "w-full bg-background px-4",
      centered
        ? "max-w-3xl"
        : "shrink-0 border-t border-border/60 pb-4 pt-4 sm:px-8 sm:pb-6",
    )}>
      <div className="mx-auto w-full max-w-3xl">
        {!centered ? <TaskPlanBadge items={plan} /> : null}
        {centered ? (
          <p className="mb-4 text-center text-xl font-medium tracking-tight text-foreground text-balance">
            What are we working on?
          </p>
        ) : null}
        <PromptInput
          models={models.map((model) => ({
            value: model.value,
            label: model.label,
            icon: model.provider === "xai"
              ? <XIcon aria-hidden="true" focusable="false" />
              : <OpenAIIcon aria-hidden="true" focusable="false" />,
          }))}
          model={model}
          minRows={2}
          maxRows={6}
          className="rounded-2xl p-2"
          placeholder={centered ? "Ask the agent anything…" : "Ask the agent to continue…"}
          aria-label="Prompt"
          loading={loading}
          onSubmit={onSubmit}
          onStop={onStop}
          onModelChange={onModelChange}
          trailingAction={
            <ReasoningEffort
              options={selectedModel?.reasoningOptions ?? []}
              value={reasoningEffort}
              onValueChange={onReasoningChange}
              trailingAction={
                modelSupportsSpeedChoice(selectedModel) ? (
                  <SpeedToggle value={fastMode} onValueChange={onSpeedChange} />
                ) : undefined
              }
            />
          }
        />
      </div>
    </div>
  );
}
