"use client";
// beui.dev/components/agents/approval-card

import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleHelp,
  LoaderCircle,
  MessageSquareText,
  X,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { AgentDisclosure } from "@/components/agents/agent-disclosure";
import { ActionSwapRollText } from "@/components/motion/action-swap-roll";
import { Button } from "@/components/motion/button";
import { Checkbox } from "@/components/motion/checkbox";
import { Input } from "@/components/motion/input";
import { RadioGroup, RadioGroupItem } from "@/components/motion/radio";
import { EASE_OUT, SPRING_SWAP } from "@/lib/ease";
import { cn } from "@/lib/utils";
import type {
  ApprovalCardAnswer,
  ApprovalCardAnswers,
  ApprovalCardProps,
  ApprovalCardQuestion,
  ApprovalCardStatus,
} from "./types";

export type {
  ApprovalCardAnswer,
  ApprovalCardAnswers,
  ApprovalCardOption,
  ApprovalCardProps,
  ApprovalCardQuestion,
  ApprovalCardStatus,
} from "./types";

const EMPTY_ANSWER: ApprovalCardAnswer = { selected: [], custom: "" };

function getStatusLabel(status: ApprovalCardStatus) {
  if (status === "submitting") return "Submitting";
  if (status === "approved") return "Approved";
  if (status === "rejected") return "Rejected";
  if (status === "changes-requested") return "Changes requested";
  if (status === "answered") return "Response submitted";
  return "Input required";
}

function getStatusClass(status: ApprovalCardStatus) {
  if (status === "approved" || status === "answered") {
    return "text-success";
  }
  if (status === "rejected") return "text-destructive";
  if (status === "changes-requested") {
    return "text-foreground";
  }
  return "text-muted-foreground";
}

function getStatusBadgeClass(status: ApprovalCardStatus) {
  if (status === "pending" || status === "changes-requested") {
    return "border-accent-foreground/20 bg-accent text-accent-foreground";
  }
  if (status === "submitting") {
    return "border-reasoning-fill/25 bg-reasoning-fill/10 text-foreground";
  }
  if (status === "approved" || status === "answered") {
    return "border-success/25 bg-success/10 text-success";
  }
  return "border-destructive/25 bg-destructive/10 text-destructive";
}

function isAnswered(answer: ApprovalCardAnswer) {
  return answer.selected.length > 0 || Boolean(answer.custom?.trim());
}

function QuestionOptions({
  question,
  answer,
  disabled,
  onChange,
  onSingleSelect,
  titleId,
  descriptionId,
}: {
  question: ApprovalCardQuestion;
  answer: ApprovalCardAnswer;
  disabled: boolean;
  onChange: (answer: ApprovalCardAnswer) => void;
  onSingleSelect?: () => void;
  titleId: string;
  descriptionId?: string;
}) {
  const custom = answer.custom ?? "";
  const optionsId = useId();
  const customLabelId = `${optionsId}-custom-label`;

  return (
    <div className="mt-3">
      {question.options?.length ? (
        question.multiple ? (
          <div className="grid gap-0.5">
            {question.options.map((option, index) => {
              const optionDescriptionId = option.description
                ? `${optionsId}-option-${index}`
                : undefined;
              return (
                <div key={option.value} className="min-w-0 rounded-lg">
                  <Checkbox
                    checked={answer.selected.includes(option.value)}
                    disabled={disabled || option.disabled}
                    label={option.label}
                    aria-describedby={optionDescriptionId}
                    onCheckedChange={(checked) =>
                      onChange({
                        ...answer,
                        selected: checked
                          ? [...answer.selected, option.value]
                          : answer.selected.filter((value) => value !== option.value),
                      })
                    }
                    className="min-h-9 rounded-lg px-1.5 py-1"
                  />
                  {option.description ? (
                    <p
                      id={optionDescriptionId}
                      className="-mt-1 ms-10 pb-2 pe-2 text-xs leading-4 text-muted-foreground"
                    >
                      {option.description}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <RadioGroup
            value={answer.selected[0] ?? ""}
            onValueChange={(value) => {
              onChange({ selected: [value], custom: "" });
              onSingleSelect?.();
            }}
            className="gap-0.5"
          >
            {question.options.map((option, index) => {
              const optionDescriptionId = option.description
                ? `${optionsId}-option-${index}`
                : undefined;
              return (
                <div key={option.value} className="min-w-0 rounded-lg">
                  <RadioGroupItem
                    value={option.value}
                    label={option.label}
                    disabled={disabled || option.disabled}
                    aria-describedby={optionDescriptionId}
                    className="min-h-9 rounded-lg px-1.5 py-1"
                  />
                  {option.description ? (
                    <p
                      id={optionDescriptionId}
                      className="-mt-1 ms-10 pb-2 pe-2 text-xs leading-4 text-muted-foreground"
                    >
                      {option.description}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </RadioGroup>
        )
      ) : null}

      {question.allowCustom ? (
        <>
          <span id={customLabelId} className="sr-only">Custom answer for</span>
          <Input
            value={custom}
            disabled={disabled}
            aria-labelledby={`${customLabelId} ${titleId}`}
            aria-describedby={descriptionId}
            placeholder={question.customPlaceholder ?? "Add another response…"}
            onChange={(value) =>
              onChange({
                selected: question.multiple ? answer.selected : [],
                custom: value,
              })
            }
            className={cn("p-0.5", question.options?.length && "mt-1.5")}
            classNames={{
              field:
                "h-10 rounded-xl border-0 bg-background/70 focus-within:bg-background",
              input: "px-3 text-sm",
            }}
          />
        </>
      ) : null}
    </div>
  );
}

function ProgressDots({ current, ids }: { current: number; ids: string[] }) {
  const reduce = useReducedMotion() ?? false;

  return (
    <span className="flex gap-1.5">
      <span className="sr-only">
        Question {current + 1} of {ids.length}
      </span>
      {ids.map((id, index) => (
        <motion.span
          key={id}
          aria-hidden="true"
          initial={{
            scale: index === current ? 1 : 0.75,
            opacity: index <= current ? 1 : 0.35,
          }}
          animate={{
            scale: index === current ? 1 : 0.75,
            opacity: index <= current ? 1 : 0.35,
          }}
          transition={reduce ? { duration: 0 } : SPRING_SWAP}
          className="size-1.5 rounded-full bg-foreground"
        />
      ))}
    </span>
  );
}

export function ApprovalCard({
  title = "Approval required",
  description,
  children,
  questions = [],
  status = "pending",
  answers,
  defaultAnswers = {},
  onAnswersChange,
  step,
  defaultStep = 0,
  onStepChange,
  onSubmit,
  onApprove,
  onReject,
  onRequestChanges,
  onDismiss,
  approveLabel = "Approve",
  submitLabel = "Submit response",
  result,
  className,
}: ApprovalCardProps) {
  const reduce = useReducedMotion() ?? false;
  const [internalAnswers, setInternalAnswers] =
    useState<ApprovalCardAnswers>(defaultAnswers);
  const [internalStep, setInternalStep] = useState(defaultStep);
  const cardId = useId();
  const autoAdvanceTimer = useRef<number | undefined>(undefined);
  const currentAnswers = answers ?? internalAnswers;
  const currentStep = Math.min(
    Math.max(0, step ?? internalStep),
    Math.max(0, questions.length - 1),
  );
  const question = questions[currentStep];
  const questionMode = questions.length > 0;
  const pending = status === "pending";
  const busy = status === "submitting";
  const interactive = pending || busy;
  const currentAnswer = question
    ? (currentAnswers[question.id] ?? EMPTY_ANSWER)
    : EMPTY_ANSWER;
  const displayTitle = question?.title ?? title;
  const titleKey = question?.id ?? String(status);
  const statusLabel = getStatusLabel(status);
  const questionTitleId = `${cardId}-question-title`;
  const questionDescriptionId = question?.description
    ? `${cardId}-question-description`
    : undefined;

  const clearAutoAdvance = useCallback(() => {
    if (autoAdvanceTimer.current === undefined) return;
    window.clearTimeout(autoAdvanceTimer.current);
    autoAdvanceTimer.current = undefined;
  }, []);

  useEffect(() => clearAutoAdvance, [clearAutoAdvance]);

  const setAnswers = useCallback(
    (next: ApprovalCardAnswers) => {
      if (answers === undefined) setInternalAnswers(next);
      onAnswersChange?.(next);
    },
    [answers, onAnswersChange],
  );

  const setStep = (next: number) => {
    clearAutoAdvance();
    if (step === undefined) setInternalStep(next);
    onStepChange?.(next);
  };

  const updateCurrentAnswer = (next: ApprovalCardAnswer) => {
    if (!question) return;
    setAnswers({ ...currentAnswers, [question.id]: next });
  };

  const continueQuestion = () => {
    if (currentStep < questions.length - 1) {
      setStep(currentStep + 1);
      return;
    }
    onSubmit?.(currentAnswers);
  };

  const queueAutoAdvance = () => {
    if (
      !question ||
      question.multiple ||
      question.autoAdvance === false ||
      currentStep >= questions.length - 1 ||
      busy
    ) {
      return;
    }

    clearAutoAdvance();
    autoAdvanceTimer.current = window.setTimeout(() => {
      setStep(currentStep + 1);
    }, 240);
  };

  return (
    <div
      data-state={status}
      aria-busy={busy}
      className={cn(
        "w-full overflow-hidden rounded-2xl bg-muted p-4 text-sm",
        className,
      )}
    >
      <span role="status" className="sr-only">{statusLabel}</span>
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={cn(
            "grid size-5 shrink-0 place-items-center text-muted-foreground",
            getStatusClass(status),
          )}
        >
          {busy ? (
            <LoaderCircle className={cn("size-4", !reduce && "animate-spin")} />
          ) : interactive ? (
            questionMode ? (
              <CircleHelp className="size-4" />
            ) : (
              <MessageSquareText className="size-4" />
            )
          ) : status === "rejected" ? (
            <X className="size-4" />
          ) : (
            <Check className="size-4" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start gap-3">
            <h3
              id={questionMode ? questionTitleId : undefined}
              className="min-w-0 flex-1 text-base font-medium leading-5 text-foreground"
            >
              <ActionSwapRollText value={titleKey}>
                {displayTitle}
              </ActionSwapRollText>
            </h3>
            {questionMode && interactive ? (
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground/65">
                {currentStep + 1}/{questions.length}
              </span>
            ) : (
              <span
                className={cn(
                  "shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
                  getStatusBadgeClass(status),
                )}
              >
                {statusLabel}
              </span>
            )}
            {onDismiss ? (
              <button
                type="button"
                aria-label="Dismiss"
                onClick={onDismiss}
                className="grid size-5 shrink-0 place-items-center rounded-full text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="size-4" />
              </button>
            ) : null}
          </div>

          <AgentDisclosure open={interactive}>
            {questionMode && question ? (
              <AnimatePresence initial={false} mode="wait">
                <motion.div
                  key={question.id}
                  initial={reduce ? { opacity: 1 } : { opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, x: -6 }}
                  transition={{ duration: reduce ? 0 : 0.2, ease: EASE_OUT }}
                >
                  {question.description ? (
                    <p
                      id={questionDescriptionId}
                      className="mt-1 leading-5 text-muted-foreground"
                    >
                      {question.description}
                    </p>
                  ) : null}
                  <QuestionOptions
                    question={question}
                    answer={currentAnswer}
                    disabled={busy}
                    onChange={updateCurrentAnswer}
                    onSingleSelect={queueAutoAdvance}
                    titleId={questionTitleId}
                    descriptionId={questionDescriptionId}
                  />
                </motion.div>
              </AnimatePresence>
            ) : (
              <div>
                {description ? (
                  <p className="mt-1 leading-5 text-muted-foreground">
                    {description}
                  </p>
                ) : null}
                {children ? <div className="mt-3">{children}</div> : null}
              </div>
            )}

            {questionMode ? (
              <div className="mt-4 flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Previous question"
                  disabled={busy || currentStep === 0}
                  onClick={() => setStep(currentStep - 1)}
                  className="rounded-full"
                >
                  <ArrowLeft className="size-4" />
                </Button>
                <ProgressDots
                  current={currentStep}
                  ids={questions.map((item) => item.id)}
                />
                <Button
                  size={currentStep === questions.length - 1 ? "sm" : "icon"}
                  aria-label={currentStep < questions.length - 1 ? "Next question" : undefined}
                  disabled={busy || !isAnswered(currentAnswer)}
                  onClick={continueQuestion}
                  className="ml-auto rounded-full"
                >
                  {busy ? (
                    <>
                      <LoaderCircle className={cn("size-4", !reduce && "animate-spin")} />
                      {currentStep === questions.length - 1 ? submitLabel : null}
                    </>
                  ) : currentStep === questions.length - 1 ? (
                    <>
                      {submitLabel}
                      <ArrowRight className="size-3.5" />
                    </>
                  ) : (
                    <ArrowRight className="size-4" />
                  )}
                </Button>
              </div>
            ) : (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={onApprove}
                  className="rounded-full"
                >
                  {approveLabel}
                </Button>
                {onRequestChanges ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={onRequestChanges}
                    className="rounded-full"
                  >
                    Request changes
                  </Button>
                ) : null}
                {onReject ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={onReject}
                    className="rounded-full text-muted-foreground hover:text-destructive"
                  >
                    Reject
                  </Button>
                ) : null}
              </div>
            )}
          </AgentDisclosure>

          {!interactive ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {result ?? statusLabel}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
