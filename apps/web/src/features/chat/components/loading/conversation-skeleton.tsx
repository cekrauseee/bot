import { Folder } from 'lucide-react'

import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { COMPOSER_SURFACE } from '../composer/composer-surface'

export function ConversationTitleSkeleton({
  className,
  showProject = false,
}: {
  className?: string
  showProject?: boolean
}) {
  return (
    <span aria-hidden="true" className={cn('flex min-w-0 flex-1 items-center gap-2', className)}>
      {showProject ? (
        <>
          <span className="inline-flex max-w-28 shrink-0 items-center gap-1.5 sm:max-w-48">
            <Folder className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.5} />
            <Skeleton className="h-3 w-16" />
          </span>
          <span className="text-xs font-normal text-border">/</span>
        </>
      ) : null}
      <Skeleton className="h-4 w-44 max-w-[45vw]" />
    </span>
  )
}

export function ConversationTranscriptSkeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('h-full min-h-0 px-4 sm:px-8', className)}
    >
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-end gap-6 pt-6 pb-10 sm:pt-8 sm:pb-12">
        <div className="flex w-full flex-col gap-7">
          <div className="flex w-full flex-row-reverse items-start gap-2">
            <div className="flex min-w-0 max-w-[88%] flex-col items-end gap-1.5">
              <Skeleton className="h-16 w-[18rem] max-w-full rounded-2xl" />
            </div>
          </div>
          <div className="flex w-full items-start gap-2">
            <div className="flex min-w-0 flex-1 flex-col items-start gap-5">
              <div className="flex w-full max-w-3xl flex-col text-sm leading-6">
                <span className="flex h-6 items-center">
                  <Skeleton className="h-3.5 w-[92%]" />
                </span>
                <span className="flex h-6 items-center">
                  <Skeleton className="h-3.5 w-[82%]" />
                </span>
                <span className="flex h-6 items-center">
                  <Skeleton className="h-3.5 w-[68%]" />
                </span>
              </div>
            </div>
          </div>
          <div className="flex w-full flex-row-reverse items-start gap-2">
            <div className="flex min-w-0 max-w-[88%] flex-col items-end gap-1.5">
              <Skeleton className="h-11 w-[12rem] max-w-full rounded-2xl" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function ComposerSkeleton({ centered = false }: { centered?: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'w-full px-4',
        centered
          ? 'bg-background sm:px-8'
          : 'shrink-0 bg-[linear-gradient(to_bottom,transparent_1rem,var(--background)_1rem)] pb-4 sm:px-8 sm:pb-6',
      )}
    >
      <div className="relative mx-auto w-full max-w-3xl">
        {centered ? (
          <p className="absolute inset-x-0 bottom-full mb-4 text-center text-xl font-medium tracking-tight text-foreground text-balance">
            What are we working on?
          </p>
        ) : null}
        <div className={COMPOSER_SURFACE}>
          <div className="h-12 px-2 pt-1.5">
            <Skeleton className="h-3.5 w-[55%] max-w-[16rem]" />
          </div>
          <div className="mt-1 flex min-h-8 items-center gap-1">
            <Skeleton className="h-8 w-28 rounded-xl" />
            <div className="ml-auto flex items-center gap-1">
              <Skeleton className="size-8 rounded-full" />
              <Skeleton className="size-8 rounded-full" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
