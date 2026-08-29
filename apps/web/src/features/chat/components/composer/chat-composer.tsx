import { OpenAIIcon } from "@/components/icons/openai-icon";
import { PromptInput } from "./prompt-input";
import { ReasoningEffort } from "@/features/chat/components/reasoning-effort";
import { SpeedToggle } from "@/features/chat/components/speed-toggle";
import type {
  ChatModelOption,
  ChatReasoningOption,
} from "@/features/chat/model";
import { cn } from "@/lib/utils";

export type ChatComposerProps = {
  models: ChatModelOption[];
  reasoningOptions: ChatReasoningOption[];
  model: string;
  reasoningEffort: string;
  fastMode: boolean;
  loading: boolean;
  onSubmit?: (value: string, model?: string) => void | Promise<void>;
  onStop?: () => void;
  onModelChange?: (model: string) => void;
  onReasoningChange: (value: string) => void;
  onSpeedChange: (value: boolean) => void;
  centered?: boolean;
};

export function ChatComposer({
  models,
  reasoningOptions,
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
  return (
    <div className={cn(
      "w-full bg-background px-4",
      centered
        ? "max-w-2xl"
        : "shrink-0 border-t border-border/60 pb-4 pt-4 sm:px-8 sm:pb-6",
    )}>
      <div className="mx-auto w-full max-w-2xl">
        {centered ? (
          <p className="mb-4 text-center text-xl font-medium tracking-tight text-foreground text-balance">
            What are we working on?
          </p>
        ) : null}
        <PromptInput
          models={models.map((model) => ({
            ...model,
            icon: <OpenAIIcon aria-hidden="true" />,
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
              options={reasoningOptions}
              value={reasoningEffort}
              onValueChange={onReasoningChange}
              trailingAction={
                <SpeedToggle value={fastMode} onValueChange={onSpeedChange} />
              }
            />
          }
        />
      </div>
    </div>
  );
}
