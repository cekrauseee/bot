"use client";

import { ArrowUp, ChevronDown, Plus, Square } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type TextareaHTMLAttributes,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/motion/button";
import {
  MorphPopover,
  MorphPopoverContent,
  MorphPopoverTrigger,
} from "@/components/motion/popover-morph";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/motion/select";
import { EASE_OUT, SPRING_SWAP } from "@/lib/ease";
import { cn } from "@/lib/utils";

export interface PromptModel {
  value: string;
  label: ReactNode;
  group?: string;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface PromptAction {
  value: string;
  label: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface PromptInputProps extends Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "value" | "defaultValue" | "onChange" | "onSubmit" | "children"
> {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  models?: PromptModel[];
  model?: string;
  defaultModel?: string;
  onModelChange?: (model: string) => void;
  actions?: PromptAction[];
  onAction?: (action: string) => void;
  onSubmit?: (value: string, model?: string) => void | Promise<void>;
  /** Disables submission without disabling or clearing the editable draft. */
  submitDisabled?: boolean;
  loading?: boolean;
  onStop?: () => void;
  minRows?: number;
  maxRows?: number;
  leadingAction?: ReactNode;
  trailingAction?: ReactNode;
  submitAction?: ReactNode;
  feedback?: ReactNode;
  /** Redirects unhandled printable typing from the surrounding page into the prompt. */
  focusOnGlobalTyping?: boolean;
  className?: string;
}

export function PromptInput({
  value,
  defaultValue = "",
  onValueChange,
  models = [],
  model,
  defaultModel,
  onModelChange,
  actions = [],
  onAction,
  onSubmit,
  submitDisabled = false,
  loading = false,
  onStop,
  minRows = 2,
  maxRows = 8,
  leadingAction,
  trailingAction,
  submitAction,
  feedback,
  focusOnGlobalTyping = false,
  className,
  disabled,
  placeholder = "Ask the agent to do something…",
  "aria-label": ariaLabel = "Prompt",
  onKeyDown,
  ...textareaProps
}: PromptInputProps) {
  const reduce = useReducedMotion() ?? false;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const measurementRef = useRef<HTMLDivElement>(null);
  const modelMeasurementRef = useRef<HTMLSpanElement>(null);
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [internalModel, setInternalModel] = useState(
    defaultModel ?? models[0]?.value,
  );
  const [actionsOpen, setActionsOpen] = useState(false);
  const [modelTriggerWidth, setModelTriggerWidth] = useState<number>();
  const currentValue = value ?? internalValue;
  const currentModelValue = model ?? internalModel;
  const currentModel = models.find(
    (option) => option.value === currentModelValue,
  );
  const modelGroups = models.reduce<Array<{ label?: string; options: PromptModel[] }>>(
    (groups, option) => {
      const current = groups.at(-1);
      if (current && current.label === option.group) {
        current.options.push(option);
      } else {
        groups.push({ label: option.group, options: [option] });
      }
      return groups;
    },
    [],
  );
  const canSubmit =
    Boolean(currentValue.trim()) &&
    Boolean(onSubmit) &&
    !disabled &&
    !submitDisabled &&
    !loading;

  const resizeTextarea = useCallback(() => {
    const textarea = textareaRef.current;
    const measurement = measurementRef.current;
    if (!textarea || !measurement || textarea.value !== currentValue) return;

    const lineHeight = 24;
    const nextHeight = Math.min(
      Math.max(measurement.scrollHeight, minRows * lineHeight),
      maxRows * lineHeight,
    );
    const height = `${nextHeight}px`;
    if (textarea.style.height !== height) textarea.style.height = height;
  }, [currentValue, maxRows, minRows]);

  useLayoutEffect(() => {
    resizeTextarea();
  }, [resizeTextarea]);

  useLayoutEffect(() => {
    const measurement = modelMeasurementRef.current;
    if (!measurement) return;
    const update = () => {
      const width = Math.ceil(measurement.getBoundingClientRect().width);
      setModelTriggerWidth((current) => current === width ? current : width);
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(measurement);
    return () => observer.disconnect();
  }, [currentModel]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(resizeTextarea);
    observer.observe(textarea);
    return () => observer.disconnect();
  }, [resizeTextarea]);

  useEffect(() => {
    if (!focusOnGlobalTyping || disabled) return;
    const focusComposer = (event: globalThis.KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.key.length !== 1 ||
        ((event.metaKey || event.ctrlKey || event.altKey) && !event.getModifierState("AltGraph"))
      ) return;

      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(
          'input, textarea, select, [contenteditable]:not([contenteditable="false"])',
        )
      ) return;

      textareaRef.current?.focus({ preventScroll: true });
    };
    window.addEventListener("keydown", focusComposer);
    return () => window.removeEventListener("keydown", focusComposer);
  }, [disabled, focusOnGlobalTyping]);

  const setValue = (next: string) => {
    if (value === undefined) setInternalValue(next);
    onValueChange?.(next);
  };

  const setModel = (next: string) => {
    if (model === undefined) setInternalModel(next);
    onModelChange?.(next);
  };

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const prompt = currentValue.trim();
    if (!prompt || !onSubmit || disabled || submitDisabled || loading) return;

    onSubmit(prompt, currentModelValue);
    if (value === undefined) setInternalValue("");
    const textarea = textareaRef.current;
    if (textarea && document.activeElement !== textarea) {
      textarea.focus({ preventScroll: true });
    }
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    onKeyDown?.(event);
    if (
      event.defaultPrevented ||
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    ) {
      return;
    }
    event.preventDefault();
    submit();
  };

  return (
    <form
      onSubmit={submit}
      onPointerDownCapture={(event) => {
        // Sending with the pointer should not blur an already-focused editor
        // and immediately focus it again when the submit handler runs.
        if (event.button === 0 && document.activeElement === textareaRef.current &&
          event.target instanceof Element && event.target.closest('button[type="submit"]')) {
          event.preventDefault();
        }
      }}
      className={cn(
        "relative w-full rounded-2xl border border-border/80 bg-card p-2 transition-colors focus-within:border-foreground/25",
        disabled && "opacity-60",
        className,
      )}
    >
      <div
        ref={measurementRef}
        aria-hidden="true"
        className="pointer-events-none invisible absolute inset-x-2 top-0 whitespace-pre-wrap px-2 text-base leading-6 [overflow-wrap:break-word] sm:text-sm"
      >
        {`${currentValue}\u200b`}
      </div>
      <textarea
        ref={textareaRef}
        value={currentValue}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={ariaLabel}
        rows={minRows}
        {...textareaProps}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        className="scrollbar-hide block w-full resize-none overflow-y-auto bg-transparent px-2 pt-1.5 text-base leading-6 text-foreground outline-none placeholder:text-muted-foreground/55 sm:text-sm"
      />

      <div className="mt-1 flex min-h-8 items-center gap-1">
        {actions.length ? (
          <MorphPopover open={actionsOpen} onOpenChange={setActionsOpen}>
            <MorphPopoverTrigger>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={disabled || loading}
                aria-label="Add to prompt"
                className="size-8 rounded-full"
              >
                <motion.span
                  aria-hidden="true"
                  animate={{ rotate: actionsOpen ? 45 : 0 }}
                  transition={reduce ? { duration: 0 } : SPRING_SWAP}
                >
                  <Plus className="size-4" />
                </motion.span>
              </Button>
            </MorphPopoverTrigger>

            <MorphPopoverContent
              side="top"
              align="start"
              sideOffset={8}
              radius={12}
              className="w-56 p-1.5"
            >
              {actions.map((action) => (
                <button
                  key={action.value}
                  type="button"
                  disabled={action.disabled}
                  onClick={() => {
                    onAction?.(action.value);
                    setActionsOpen(false);
                  }}
                  className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left outline-none transition-colors hover:bg-muted focus-visible:bg-muted disabled:pointer-events-none disabled:opacity-50"
                >
                  {action.icon ? (
                    <span className="mt-0.5 grid size-5 shrink-0 place-items-center text-muted-foreground [&_svg]:size-4">
                      {action.icon}
                    </span>
                  ) : null}
                  <span className="min-w-0">
                    <span className="block text-sm text-foreground">
                      {action.label}
                    </span>
                    {action.description ? (
                      <span className="mt-0.5 block text-xs leading-4 text-muted-foreground">
                        {action.description}
                      </span>
                    ) : null}
                  </span>
                </button>
              ))}
            </MorphPopoverContent>
          </MorphPopover>
        ) : null}
        {leadingAction}
        {models.length ? (
          <Select
            value={currentModelValue}
            onValueChange={setModel}
            disabled={disabled || loading}
            className="min-w-0 max-w-52"
          >
            <span
              ref={modelMeasurementRef}
              aria-hidden="true"
              className="pointer-events-none invisible absolute flex h-8 w-max items-center justify-between gap-2 px-2 text-xs"
            >
              <span className="flex items-center gap-1.5">
                {currentModel?.icon ? (
                  <span className="grid size-4 shrink-0 place-items-center [&_svg]:size-3.5">
                    {currentModel.icon}
                  </span>
                ) : null}
                <span>{currentModel?.label ?? "Choose model"}</span>
              </span>
              <ChevronDown className="size-4 shrink-0" />
            </span>
            <motion.div
              initial={false}
              animate={modelTriggerWidth === undefined ? undefined : { width: modelTriggerWidth }}
              transition={reduce ? { duration: 0 } : { duration: 0.22, ease: EASE_OUT }}
              className="max-w-full"
            >
              <SelectTrigger className="h-8 w-full rounded-xl border-0 bg-transparent px-2 py-0 text-xs hover:bg-muted focus-visible:ring-2 disabled:opacity-100">
                <span className="flex min-w-0 items-center gap-1.5">
                  {currentModel?.icon ? (
                    <span className="grid size-4 shrink-0 place-items-center text-muted-foreground [&_svg]:size-3.5">
                      {currentModel.icon}
                    </span>
                  ) : null}
                  <span className="truncate text-muted-foreground">
                    {currentModel?.label ?? "Choose model"}
                  </span>
                </span>
              </SelectTrigger>
            </motion.div>
            <SelectContent className="right-auto w-52 shadow-none">
              {modelGroups.map((group, groupIndex) => (
                <div
                  key={group.label ?? `models-${groupIndex}`}
                  role={group.label ? "group" : "presentation"}
                  aria-label={group.label}
                  className={cn(groupIndex > 0 && "mt-1 border-t border-border/70 pt-1")}
                >
                  {group.label ? (
                    <div
                      aria-hidden="true"
                      className="px-2.5 pb-1 pt-1.5 text-[11px] font-medium text-muted-foreground"
                    >
                      {group.label}
                    </div>
                  ) : null}
                  {group.options.map((option) => (
                    <SelectItem
                      key={option.value}
                      value={option.value}
                      disabled={option.disabled}
                      className="py-1.5"
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        {option.icon ? (
                          <span className="grid size-4 shrink-0 place-items-center text-muted-foreground [&_svg]:size-3.5">
                            {option.icon}
                          </span>
                        ) : null}
                        <span className="min-w-0 truncate text-xs text-foreground">
                          {option.label}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </div>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {trailingAction}
          {submitAction ?? <Button
            type={loading ? "button" : "submit"}
            size="icon"
            disabled={loading ? !onStop : !canSubmit}
            aria-label={loading ? "Stop run" : "Send prompt"}
            onClick={loading ? onStop : undefined}
            className="size-8 rounded-full"
          >
            <AnimatePresence initial={false} mode="popLayout">
              <motion.span
                key={loading ? "stop" : "send"}
                initial={reduce ? { opacity: 1 } : { opacity: 0, y: 3, scale: 0.8 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: -3, scale: 0.8 }}
                transition={reduce ? { duration: 0 } : SPRING_SWAP}
                className="grid place-items-center"
              >
                {loading ? (
                  <Square className="size-3 fill-current" />
                ) : (
                  <ArrowUp className="size-4" />
                )}
              </motion.span>
            </AnimatePresence>
          </Button>}
        </div>
      </div>
      {feedback}
    </form>
  );
}
