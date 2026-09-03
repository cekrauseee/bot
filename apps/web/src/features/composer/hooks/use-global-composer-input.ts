import { useEffect, type RefObject } from "react"

type GlobalComposerKeyInput = {
  altGraph: boolean
  altKey: boolean
  ctrlKey: boolean
  defaultPrevented: boolean
  isComposing: boolean
  key: string
  metaKey: boolean
}

export function shouldFocusComposerForKey({
  altGraph,
  altKey,
  ctrlKey,
  defaultPrevented,
  isComposing,
  key,
  metaKey,
}: GlobalComposerKeyInput) {
  if (defaultPrevented || isComposing) return false

  const pasteShortcut =
    (ctrlKey || metaKey) && !altKey && key.toLowerCase() === "v"
  if (pasteShortcut) return true

  if (key.length !== 1) return false
  return (!metaKey && !ctrlKey && !altKey) || altGraph
}

function isEditableTarget(target: EventTarget | null) {
  return (
    target instanceof Element &&
    target.closest(
      'input, textarea, select, [role="textbox"], [contenteditable]:not([contenteditable="false"])'
    ) !== null
  )
}

export function useGlobalComposerInput(
  textareaRef: RefObject<HTMLTextAreaElement | null>,
  enabled: boolean
) {
  useEffect(() => {
    if (!enabled) return

    const redirectTyping = (event: KeyboardEvent) => {
      const textarea = textareaRef.current
      if (!textarea || textarea.disabled || textarea.readOnly) return
      if (isEditableTarget(event.target)) return
      if (
        !shouldFocusComposerForKey({
          altGraph: event.getModifierState("AltGraph"),
          altKey: event.altKey,
          ctrlKey: event.ctrlKey,
          defaultPrevented: event.defaultPrevented,
          isComposing: event.isComposing,
          key: event.key,
          metaKey: event.metaKey,
        })
      ) {
        return
      }

      textarea.focus({ preventScroll: true })
    }

    document.addEventListener("keydown", redirectTyping)
    return () => document.removeEventListener("keydown", redirectTyping)
  }, [enabled, textareaRef])
}
