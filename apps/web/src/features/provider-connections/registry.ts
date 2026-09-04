import type { ComponentType } from "react"

import {
  createProviderConnectionApi,
  openAiCodexConnectionApi,
  type ProviderConnectionApi,
} from "@/features/provider-connections/api"
import {
  CodexProviderCard,
  type ProviderConnectionCardProps,
} from "@/features/provider-connections/components/codex-provider-card"
import { codexProvider } from "@/features/provider-connections/model"
import {
  GithubProviderCard,
  type GithubProviderCardProps,
} from "@/features/provider-connections/components/github-provider-card"

export type ProviderUiRegistration = {
  connectionId: string
  providerId: string
  providerName: string
  api: ProviderConnectionApi
  Card: ComponentType<ProviderConnectionCardProps | GithubProviderCardProps>
}

export const providerUiRegistry: readonly ProviderUiRegistration[] = [
  {
    connectionId: "openai-codex",
    providerId: codexProvider.id,
    providerName: codexProvider.displayName,
    api: openAiCodexConnectionApi,
    Card: CodexProviderCard,
  },
  {
    connectionId: "github",
    providerId: "github",
    providerName: "GitHub",
    api: createProviderConnectionApi("github"),
    Card: GithubProviderCard,
  },
]
