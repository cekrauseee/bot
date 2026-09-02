type ComposerLayoutInput = {
  availableWidth: number
  textWidth: number
  value: string
}

export function shouldStackComposer({
  availableWidth,
  textWidth,
  value,
}: ComposerLayoutInput) {
  return value.includes("\n") || textWidth > availableWidth
}
