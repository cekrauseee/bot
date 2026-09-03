import { Skeleton } from "@/components/ui/skeleton"

function UserMessageSkeleton({ width }: { width: string }) {
  return (
    <div className="flex w-full min-w-0 flex-row-reverse gap-2 pb-7">
      <div className="flex max-w-3xl min-w-0 flex-col items-end gap-2">
        <div className="w-fit max-w-full rounded-xl bg-secondary px-4 py-2.5">
          <Skeleton className="h-6" style={{ width }} />
        </div>
      </div>
    </div>
  )
}

function ProcessSkeleton() {
  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <div className="-ms-1 flex h-7 items-center gap-1 px-1">
        <Skeleton className="h-3.5 w-32" />
      </div>
      <div className="h-px w-full bg-border/70" />
    </div>
  )
}

function AssistantMessageSkeleton() {
  return (
    <div className="flex w-full min-w-0 gap-2 pb-7">
      <div className="flex w-full min-w-0 flex-col gap-4">
        <ProcessSkeleton />
        <div className="flex w-full flex-col gap-2">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-[92%]" />
          <Skeleton className="h-6 w-[68%]" />
        </div>
      </div>
    </div>
  )
}

export function ConversationSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="size-full min-h-0 overflow-hidden [mask-image:linear-gradient(to_bottom,black_0,black_calc(100%_-_var(--composer-dock-height,4rem)_+_0.75rem),transparent_calc(100%_-_var(--composer-dock-height,4rem)_+_1.75rem))] px-4"
    >
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-end gap-1 pt-8 pb-[calc(var(--composer-dock-height,4rem)+2rem)] sm:pt-10 sm:pb-[calc(var(--composer-dock-height,4rem)+2.5rem)]">
        <UserMessageSkeleton width="14rem" />
        <AssistantMessageSkeleton />
        <UserMessageSkeleton width="10rem" />
        <AssistantMessageSkeleton />
      </div>
    </div>
  )
}
