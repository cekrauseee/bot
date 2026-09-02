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
import { cn } from "@/lib/utils"

const OPENAI_MODELS = [
  { label: "GPT-5.6 Sol", value: "gpt-5.6-sol" },
  { label: "GPT-5.6 Terra", value: "gpt-5.6-terra" },
  { label: "GPT-5.6 Luna", value: "gpt-5.6-luna" },
] as const

const REASONING_EFFORTS = [
  { label: "None", value: "none" },
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
  { label: "Extra high", value: "xhigh" },
  { label: "Max", value: "max" },
] as const

type OpenAiModel = (typeof OPENAI_MODELS)[number]["value"]
type ReasoningEffort = (typeof REASONING_EFFORTS)[number]["value"]

export type ComposerSubmission = {
  fastMode: boolean
  message: string
  model: string
  reasoningEffort: string
}

type ComposerProps = {
  onSubmit?: (
    submission: ComposerSubmission,
    onAccepted: () => void
  ) => Promise<void>
}

export function Composer({ onSubmit }: ComposerProps) {
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)
  const composerSurfaceRef = useRef<HTMLDivElement>(null)
  const composerControlsRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [stackControls, setStackControls] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [model, setModel] = useState<OpenAiModel>("gpt-5.6-sol")
  const [reasoningEffort, setReasoningEffort] =
    useState<ReasoningEffort>("medium")
  const [fastMode, setFastMode] = useState(false)
  const selectedModel = OPENAI_MODELS.find((item) => item.value === model)!
  const selectedReasoningEffort = REASONING_EFFORTS.find(
    (item) => item.value === reasoningEffort
  )!

  useGlobalComposerInput(textareaRef, !submitting)

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
    if (!trimmedMessage || !onSubmit || submittingRef.current) return

    submittingRef.current = true
    setSubmitting(true)
    setSubmitError(null)

    try {
      await onSubmit(
        {
          fastMode,
          message: trimmedMessage,
          model,
          reasoningEffort,
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
      aria-busy={submitting}
      onSubmit={handleSubmit}
    >
      <FieldGroup className="gap-2">
        <Field data-invalid={submitError ? true : undefined}>
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
                submitError ? "composer-submit-error" : undefined
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
                    aria-label={`${selectedModel.label}, ${selectedReasoningEffort.label}${fastMode ? ", fast mode" : ""}`}
                    disabled={submitting}
                    render={
                      <InputGroupButton variant="ghost-contrast" size="sm" />
                    }
                  >
                    {fastMode && (
                      <ZapIcon
                        aria-hidden="true"
                        data-icon="inline-start"
                        fill="currentColor"
                        strokeWidth={1.5}
                      />
                    )}
                    <span className="truncate">{selectedModel.label}</span>
                    <span className="font-normal text-muted-foreground">
                      {selectedReasoningEffort.label}
                    </span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    side="top"
                    align="end"
                    className="min-w-52"
                  >
                    <DropdownMenuGroup>
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger className="[&>svg:last-child]:ml-2">
                          Model
                          <span className="ms-auto text-xs text-muted-foreground">
                            {selectedModel.label}
                          </span>
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="min-w-44">
                          <DropdownMenuGroup>
                            <DropdownMenuRadioGroup
                              value={model}
                              onValueChange={(value) =>
                                setModel(value as OpenAiModel)
                              }
                            >
                              {OPENAI_MODELS.map((item) => (
                                <DropdownMenuRadioItem
                                  key={item.value}
                                  value={item.value}
                                >
                                  {item.label}
                                </DropdownMenuRadioItem>
                              ))}
                            </DropdownMenuRadioGroup>
                          </DropdownMenuGroup>
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>

                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger className="[&>svg:last-child]:ml-2">
                          Effort
                          <span className="ms-auto text-xs text-muted-foreground">
                            {selectedReasoningEffort.label}
                          </span>
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="min-w-40">
                          <DropdownMenuGroup>
                            <DropdownMenuRadioGroup
                              value={reasoningEffort}
                              onValueChange={(value) =>
                                setReasoningEffort(value as ReasoningEffort)
                              }
                            >
                              {REASONING_EFFORTS.map((item) => (
                                <DropdownMenuRadioItem
                                  key={item.value}
                                  value={item.value}
                                >
                                  {item.label}
                                </DropdownMenuRadioItem>
                              ))}
                            </DropdownMenuRadioGroup>
                          </DropdownMenuGroup>
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>

                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger className="[&>svg:last-child]:ml-2">
                          Speed
                          <span className="ms-auto text-xs text-muted-foreground">
                            {fastMode ? "Fast" : "Standard"}
                          </span>
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="min-w-36">
                          <DropdownMenuGroup>
                            <DropdownMenuRadioGroup
                              value={fastMode ? "fast" : "standard"}
                              onValueChange={(value) =>
                                setFastMode(value === "fast")
                              }
                            >
                              <DropdownMenuRadioItem value="standard">
                                Standard
                              </DropdownMenuRadioItem>
                              <DropdownMenuRadioItem value="fast">
                                Fast
                              </DropdownMenuRadioItem>
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
                  disabled={!message.trim() || submitting}
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
          <FieldError id="composer-submit-error">{submitError}</FieldError>
        </Field>
      </FieldGroup>
    </form>
  )
}
