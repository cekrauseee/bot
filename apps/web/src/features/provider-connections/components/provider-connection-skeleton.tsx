import { ChevronDownIcon } from "lucide-react"

import { Card, CardHeader } from "@/components/ui/card"
import { OpenAILogo } from "@/components/ui/openai-logo"
import { Skeleton } from "@/components/ui/skeleton"
import { codexProvider } from "@/features/provider-connections/model"

export function ProviderConnectionSkeleton() {
  return (
    <Card
      aria-busy="true"
      aria-label="Loading provider status"
      className="gap-0 py-0 ring-0"
      role="status"
    >
      <CardHeader className="flex items-center gap-1 p-0">
        <div className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left">
          <OpenAILogo className="size-4 shrink-0" />
          <span className="truncate font-medium">
            {codexProvider.displayName}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {codexProvider.productName}
          </span>
          <ChevronDownIcon
            aria-hidden="true"
            className="ml-auto size-4 shrink-0 text-muted-foreground"
          />
        </div>
        <Skeleton className="mr-2 h-[18.4px] w-8 rounded-full" />
      </CardHeader>
    </Card>
  )
}
