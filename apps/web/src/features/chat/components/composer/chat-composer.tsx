import { OpenAIIcon } from "@/components/icons/openai-icon";
import { PromptInput } from "./prompt-input";
import { ReasoningEffort } from "@/features/chat/components/reasoning-effort";
import { SpeedToggle } from "@/features/chat/components/speed-toggle";
import type {
  ChatModelOption,
  ChatReasoningOption,
} from "@/features/chat/model";

export type ChatComposerProps = {
  models: ChatModelOption[];
  reasoningOptions: ChatReasoningOption[];
  reasoningEffort: string;
  fastMode: boolean;
  loading: boolean;
  onSubmit?: (value: string, model?: string) => void | Promise<void>;
  onStop?: () => void;
  onModelChange?: (model: string) => void;
  onReasoningChange: (value: string) => void;
  onSpeedChange: (value: boolean) => void;
};

export function ChatComposer({
  models,
  reasoningOptions,
  reasoningEffort,
  fastMode,
  loading,
  onSubmit,
  onStop,
  onModelChange,
  onReasoningChange,
  onSpeedChange,
}: ChatComposerProps) {
  return (
    <div className="shrink-0 border-t border-border/60 bg-background px-4 pb-4 pt-4 sm:px-8 sm:pb-6">
      <div className="mx-auto w-full max-w-2xl">
        <PromptInput
          models={models.map((model) => ({
            ...model,
            icon: <OpenAIIcon aria-hidden="true" />,
          }))}
          minRows={2}
          maxRows={6}
          className="rounded-2xl p-2"
          placeholder="Ask the agent to continue…"
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
