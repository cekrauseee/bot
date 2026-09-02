type ComposerKeyInput = {
  isComposing: boolean
  key: string
  shiftKey: boolean
}

export function shouldSubmitComposerKey({
  isComposing,
  key,
  shiftKey,
}: ComposerKeyInput) {
  return key === "Enter" && !shiftKey && !isComposing
}
