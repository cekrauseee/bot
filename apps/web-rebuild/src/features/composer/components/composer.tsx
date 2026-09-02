import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from "react"
import { ArrowUpIcon, ZapIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"
import { shouldSubmitComposerKey } from "@/features/composer/composer-keyboard"
import { shouldStackComposer } from "@/features/composer/composer-layout"
import { useGlobalComposerInput } from "@/features/composer/hooks/use-global-composer-input"
import type { ComposerModel } from "@/features/composer/model-catalog"
import { cn } from "@/lib/utils"

const SELECTABLE_MODEL_IDS = new Set([
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "gpt-5.6-luna",
])

const reasoningEffortLabel = (value: string) => {
  if (value === "none") return "None"
  if (value === "xhigh") return "Extra high"
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`
}

const processingModeLabel = (value: string) =>
  value === "fast" ? "Fast" : "Standard"

export type ComposerSubmission = {
  fastMode: boolean
  message: string
  model: string
  reasoningEffort: string
}

type ComposerProps = {
  model: string
  models: ComposerModel[]
  modelContextKey: string
  modelDisabled?: boolean
  providerDisabled?: boolean
  modelScope: "conversation" | "default"
  onModelChange: (model: string) => Promise<void>
  onSubmit?: (
    submission: ComposerSubmission,
    onAccepted: () => void
  ) => Promise<void>
}

export function Composer({
  model,
  models,
  modelContextKey,
  modelDisabled = false,
  providerDisabled = false,
  modelScope,
  onModelChange,
  onSubmit,
}: ComposerProps) {
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)
  const composerSurfaceRef = useRef<HTMLDivElement>(null)
  const composerControlsRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [stackControls, setStackControls] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [modelError, setModelError] = useState<{
    contextKey: string
    message: string
  } | null>(null)
  const [pendingModel, setPendingModel] = useState<{
    contextKey: string
    model: string
  } | null>(null)
  const [modelChanging, setModelChanging] = useState(false)
  const modelChangingRef = useRef(false)
  const [reasoningEffort, setReasoningEffort] = useState("medium")
  const [fastMode, setFastMode] = useState(false)
  const effectiveModel =
    pendingModel?.contextKey === modelContextKey ? pendingModel.model : model
  const visibleModelError =
    modelError?.contextKey === modelContextKey ? modelError.message : null
  const selectedModel = models.find((item) => item.id === effectiveModel)
  const availableReasoningEfforts =
    selectedModel?.reasoning_efforts.options ?? [reasoningEffort]
  const effectiveReasoningEffort = availableReasoningEfforts.includes(
    reasoningEffort
  )
    ? reasoningEffort
    : (selectedModel?.reasoning_efforts.default ?? reasoningEffort)
  const selectedReasoningEffortLabel = reasoningEffortLabel(
    effectiveReasoningEffort
  )
  const requestedProcessingMode = fastMode ? "fast" : "standard"
  const effectiveProcessingMode = selectedModel?.processing_modes.options.includes(
    requestedProcessingMode
  )
    ? requestedProcessingMode
    : (selectedModel?.processing_modes.default ?? "standard")
  const effectiveFastMode = effectiveProcessingMode === "fast"
  const selectedModelLabel = selectedModel?.label ?? effectiveModel

  const error = submitError ?? visibleModelError

  useGlobalComposerInput(textareaRef, !submitting && !modelChanging)

  const handleModelChange = async (value: string) => {
    if (
      value === effectiveModel ||
      submittingRef.current ||
      modelChangingRef.current ||
      modelDisabled
    ) {
      return
    }

    modelChangingRef.current = true
    setModelChanging(true)
    setModelError(null)
    setPendingModel({ contextKey: modelContextKey, model: value })

    try {
      await onModelChange(value)
    } catch (changeError) {
      setModelError({
        contextKey: modelContextKey,
        message:
          changeError instanceof Error
            ? changeError.message
            : "Unable to save the selected model. Try again.",
      })
    } finally {
      modelChangingRef.current = false
      setModelChanging(false)
      setPendingModel(null)
    }
  }

  const updateComposerLayout = useCallback(() => {
    const surface = composerSurfaceRef.current
    const controls = composerControlsRef.current
    const textarea = textareaRef.current
    if (!surface || !controls || !textarea) return

    if (!message) {
      setStackControls(false)
      return
    }

    const textareaStyle = window.getComputedStyle(textarea)
    const canvas = document.createElement("canvas")
    const context = canvas.getContext("2d")
    if (!context) return

    context.font = textareaStyle.font
    const composerStyle = window.getComputedStyle(surface)
    const inset =
      Number.parseFloat(composerStyle.getPropertyValue("--composer-inset")) ||
      10
    const horizontalPadding =
      Number.parseFloat(textareaStyle.paddingInlineStart) +
      Number.parseFloat(textareaStyle.paddingInlineEnd)
    const availableWidth =
      surface.clientWidth -
      controls.getBoundingClientRect().width -
      inset -
      horizontalPadding
    const textWidth = context.measureText(message).width

    setStackControls(
      shouldStackComposer({ availableWidth, textWidth, value: message })
    )
  }, [message])

  useLayoutEffect(() => {
    const frame = window.requestAnimationFrame(updateComposerLayout)

    const observer = new ResizeObserver(updateComposerLayout)
    if (composerSurfaceRef.current) {
      observer.observe(composerSurfaceRef.current)
    }
    if (composerControlsRef.current) {
      observer.observe(composerControlsRef.current)
    }

    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [updateComposerLayout])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const trimmedMessage = message.trim()
    if (
      !trimmedMessage ||
      !onSubmit ||
      submittingRef.current ||
      modelChangingRef.current ||
      modelDisabled ||
      providerDisabled
    ) {
      return
    }

    submittingRef.current = true
    setSubmitting(true)
    setSubmitError(null)

    try {
      await onSubmit(
        {
          fastMode: effectiveFastMode,
          message: trimmedMessage,
          model,
          reasoningEffort: effectiveReasoningEffort,
        },
        () => setMessage("")
      )
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Unable to send the message. Try again."
      )
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  return (
    <form
      aria-label="Message composer"
      aria-busy={submitting || modelChanging}
      onSubmit={handleSubmit}
    >
      <FieldGroup className="gap-2">
        <Field data-invalid={error ? true : undefined}>
          <FieldLabel htmlFor="composer-message" className="sr-only">
            Message
          </FieldLabel>
          <InputGroup
            ref={composerSurfaceRef}
            className="rounded-2xl shadow-sm [--composer-inset:--spacing(2.5)]"
          >
            <InputGroupTextarea
              ref={textareaRef}
              id="composer-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={(event) => {
                if (
                  !shouldSubmitComposerKey({
                    isComposing: event.nativeEvent.isComposing,
                    key: event.key,
                    shiftKey: event.shiftKey,
                  })
                ) {
                  return
                }

                event.preventDefault()
                event.currentTarget.form?.requestSubmit()
              }}
              placeholder="Message"
              rows={1}
              enterKeyHint="send"
              readOnly={submitting}
              aria-invalid={submitError ? true : undefined}
              aria-describedby={
                submitError ? "composer-error" : undefined
              }
              className="max-h-48 min-h-10 min-w-0 overflow-y-auto px-(--composer-inset) pt-(--composer-inset) pb-1"
            />
            <InputGroupAddon
              align={stackControls ? "block-end" : "inline-end"}
              className={cn(
                "justify-end gap-1.5",
                stackControls
                  ? "px-(--composer-inset) pt-0 pb-(--composer-inset)"
                  : "shrink-0 pr-(--composer-inset) pl-0"
              )}
            >
              <div
                ref={composerControlsRef}
                className="flex items-center gap-1.5"
              >
                <DropdownMenu>
                  <DropdownMenuTrigger
                    aria-label={`${modelScope === "default" ? "Default model" : "Conversation model"}: ${selectedModelLabel}, ${selectedReasoningEffortLabel}${effectiveFastMode ? ", fast mode" : ""}`}
                    aria-describedby={
                      visibleModelError ? "composer-error" : undefined
                    }
                    disabled={submitting || modelChanging || modelDisabled}
                    render={
                      <InputGroupButton
                        variant="ghost-contrast"
                        size="sm"
                        className="gap-1"
                      />
                    }
                  >
                    {effectiveFastMode && (
                      <ZapIcon
                        aria-hidden="true"
                        data-icon="inline-start"
                        fill="currentColor"
                        strokeWidth={1.5}
                      />
                    )}
                    <span className="truncate font-semibold text-foreground">
                      {selectedModelLabel}
                    </span>
                    {effectiveReasoningEffort !== "none" ? (
                      <span className="font-normal text-muted-foreground">
                        {selectedReasoningEffortLabel}
                      </span>
                    ) : null}
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    side="top"
                    align="end"
                    className="w-max min-w-52"
                  >
                    <DropdownMenuGroup>
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger className="whitespace-nowrap [&>svg:last-child]:ml-2">
                          {modelScope === "default" ? "Default model" : "Model"}
                          <span className="ms-auto shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                            {selectedModelLabel}
                          </span>
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="min-w-44">
                          <DropdownMenuGroup>
                            <DropdownMenuRadioGroup
                              value={effectiveModel}
                              onValueChange={(value) =>
                                void handleModelChange(value)
                              }
                            >
                              {models
                                .filter(
                                  (item) =>
                                    item.active &&
                                    SELECTABLE_MODEL_IDS.has(item.id)
                                )
                                .map((item) => (
                                  <DropdownMenuRadioItem
                                    key={item.id}
                                    value={item.id}
                                  >
                                    {item.label}
                                  </DropdownMenuRadioItem>
                                ))}
                            </DropdownMenuRadioGroup>
                          </DropdownMenuGroup>
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>

                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger className="whitespace-nowrap [&>svg:last-child]:ml-2">
                          Effort
                          <span className="ms-auto shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                            {selectedReasoningEffortLabel}
                          </span>
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="min-w-40">
                          <DropdownMenuGroup>
                            <DropdownMenuRadioGroup
                              value={effectiveReasoningEffort}
                              onValueChange={setReasoningEffort}
                            >
                              {availableReasoningEfforts.map((value) => (
                                <DropdownMenuRadioItem
                                  key={value}
                                  value={value}
                                >
                                  {reasoningEffortLabel(value)}
                                </DropdownMenuRadioItem>
                              ))}
                            </DropdownMenuRadioGroup>
                          </DropdownMenuGroup>
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>

                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger className="whitespace-nowrap [&>svg:last-child]:ml-2">
                          Speed
                          <span className="ms-auto shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                            {processingModeLabel(effectiveProcessingMode)}
                          </span>
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="min-w-36">
                          <DropdownMenuGroup>
                            <DropdownMenuRadioGroup
                              value={effectiveProcessingMode}
                              onValueChange={(value) =>
                                setFastMode(value === "fast")
                              }
                            >
                              {(selectedModel?.processing_modes.options ?? [
                                "standard",
                              ]).map((value) => (
                                <DropdownMenuRadioItem
                                  key={value}
                                  value={value}
                                >
                                  {processingModeLabel(value)}
                                </DropdownMenuRadioItem>
                              ))}
                            </DropdownMenuRadioGroup>
                          </DropdownMenuGroup>
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button
                  type="submit"
                  variant="default"
                  size="icon"
                  aria-label={submitting ? "Sending message" : "Send message"}
                  disabled={
                    !message.trim() ||
                    submitting ||
                    modelChanging ||
                    modelDisabled ||
                    providerDisabled
                  }
                >
                  {submitting ? (
                    <Spinner aria-hidden="true" data-icon="inline-start" />
                  ) : (
                    <ArrowUpIcon aria-hidden="true" data-icon="inline-start" />
                  )}
                </Button>
              </div>
            </InputGroupAddon>
          </InputGroup>
          <FieldError id="composer-error">{error}</FieldError>
        </Field>
      </FieldGroup>
    </form>
  )
}
