import { OpenAIIcon } from "@/components/icons/openai-icon";
import { PromptInput } from "./prompt-input";
import { ReasoningEffort } from "@/features/chat/components/reasoning-effort";
import { SpeedToggle } from "@/features/chat/components/speed-toggle";
import type {
  ChatModelOption,
  ChatReasoningOption,
} from "@/features/chat/model";
import { cn } from "@/lib/utils";
import { COMPOSER_SURFACE } from './composer-surface';
import { AnimatePresence, motion } from 'motion/react';
import { EASE_OUT } from '@/lib/ease';
import { useComposerPosition } from '../../hooks/use-composer-position';
import type { ConversationEntry } from '../../motion/conversation-entry';
import { memo, useId, useMemo, useState } from 'react';
import { ComposerSubmitAction, type ComposerActionLabels } from './composer-submit-action';

export type ChatComposerProps = {
  entry: ConversationEntry;
  conversationKey: string;
  viewportId: string;
  models: ChatModelOption[];
  reasoningOptions: ChatReasoningOption[];
  model: string;
  reasoningEffort: string;
  fastMode: boolean;
  loading: boolean;
  submitDisabled?: boolean;
  submitError?: string;
  submittedPrompt?: string;
  actionLabels?: ComposerActionLabels;
  onSubmit?: (value: string, model?: string, onAccepted?: () => void) => void | Promise<void>;
  onStop?: () => void;
  onModelChange?: (model: string) => void;
  onReasoningChange: (value: string) => void;
  onSpeedChange: (value: boolean) => void;
  centered?: boolean;
};

export const ChatComposer = memo(function ChatComposer({
  entry,
  conversationKey,
  viewportId,
  models,
  reasoningOptions,
  model,
  reasoningEffort,
  fastMode,
  loading,
  submitDisabled = false,
  submitError = '',
  submittedPrompt,
  actionLabels,
  onSubmit,
  onStop,
  onModelChange,
  onReasoningChange,
  onSpeedChange,
  centered = false,
}: ChatComposerProps) {
  const [draft, setDraft] = useState('');
  const errorId = useId();
  const promptModels = useMemo(() => models.map((option) => ({
    ...option, icon: <OpenAIIcon aria-hidden="true" />,
  })), [models]);
  const visibleError = centered && !loading && draft.trim() === submittedPrompt ? submitError : '';
  const { dockRef, surfaceRef, captureSubmitPosition } = useComposerPosition(centered, viewportId, entry, conversationKey);
  return (
    <div ref={dockRef} className={cn(
      "pointer-events-none relative w-full shrink-0 px-4 pb-4 sm:px-8 sm:pb-6",
      !centered && "bg-[linear-gradient(to_bottom,transparent_1rem,var(--background)_1rem)]",
    )}>
      <div
        ref={surfaceRef}
        className="relative mx-auto w-full max-w-3xl"
      >
        <AnimatePresence initial={false}>
        {centered ? (
          <motion.p
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.12, ease: EASE_OUT }}
            className="absolute inset-x-0 bottom-full mb-4 text-center text-xl font-medium tracking-tight text-foreground text-balance"
          >
            What are we working on?
          </motion.p>
        ) : null}
        </AnimatePresence>
        <PromptInput
          value={draft}
          onValueChange={setDraft}
          aria-invalid={Boolean(visibleError) || undefined}
          aria-describedby={visibleError ? errorId : undefined}
          models={promptModels}
          model={model}
          minRows={2}
          maxRows={6}
          className={cn(COMPOSER_SURFACE, "pointer-events-auto")}
          placeholder={centered ? "Ask the agent anything…" : "Ask the agent to continue…"}
          aria-label="Prompt"
          focusOnGlobalTyping
          loading={loading}
          submitDisabled={submitDisabled}
          onSubmit={onSubmit ? (value, selectedModel) => {
            const submittedDraft = draft;
            return onSubmit(value, selectedModel, () => {
              captureSubmitPosition();
              setDraft((current) => current === submittedDraft ? '' : current);
            });
          } : undefined}
          onStop={onStop}
          onModelChange={onModelChange}
          submitAction={
            <ComposerSubmitAction
              centered={centered}
              loading={loading}
              canSubmit={!submitDisabled && Boolean(draft.trim()) && Boolean(onSubmit)}
              error={visibleError}
              errorId={errorId}
              onStop={onStop}
              labels={actionLabels}
            />
          }
          feedback={<span id={errorId} role="alert" className="sr-only">{visibleError}</span>}
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
});
