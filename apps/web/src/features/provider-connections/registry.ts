import type { ComponentType } from "react"

import {
  openAiCodexConnectionApi,
  type ProviderConnectionApi,
} from "@/features/provider-connections/api"
import {
  CodexProviderCard,
  type ProviderConnectionCardProps,
} from "@/features/provider-connections/components/codex-provider-card"
import { codexProvider } from "@/features/provider-connections/model"

export type ProviderUiRegistration = {
  connectionId: string
  providerId: string
  providerName: string
  api: ProviderConnectionApi
  Card: ComponentType<ProviderConnectionCardProps>
}

export const providerUiRegistry: readonly ProviderUiRegistration[] = [
  {
    connectionId: "openai-codex",
    providerId: codexProvider.id,
    providerName: codexProvider.displayName,
    api: openAiCodexConnectionApi,
    Card: CodexProviderCard,
  },
]
