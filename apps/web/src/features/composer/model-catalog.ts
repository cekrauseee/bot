export type ComposerModel = {
  id: string
  label: string
  provider: string
  active: boolean
  reasoning_efforts: {
    default: string
    options: string[]
  }
  processing_modes: {
    default: "fast" | "standard"
    options: Array<"fast" | "standard">
  }
}
