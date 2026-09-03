import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export function ProviderConnectionSkeleton() {
  return (
    <Card
      aria-busy="true"
      aria-label="Loading provider status"
      className="gap-0 py-0 ring-0"
      role="status"
    >
      <CardContent className="flex h-8 items-center gap-2 px-2 py-0">
        <Skeleton className="size-4 rounded-sm" />
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-3 w-12" />
        <Skeleton className="ml-auto size-4 rounded-sm" />
        <Skeleton className="mr-2 h-5 w-9 rounded-full" />
      </CardContent>
    </Card>
  )
}
