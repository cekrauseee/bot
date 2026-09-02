export type ComposerModel = {
  id: string
  label: string
  reasoning_efforts: {
    default: string
    options: string[]
  }
  processing_modes: {
    default: "fast" | "standard"
    options: Array<"fast" | "standard">
  }
}
