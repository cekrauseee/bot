import { useEffect, useRef } from "react"

import { Button } from "@/components/ui/button"

type SessionErrorProps = { onRetry: () => void }

export function SessionError({ onRetry }: SessionErrorProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <section
        className="w-full max-w-sm text-center"
        aria-labelledby="session-error-title"
      >
        <h1
          ref={headingRef}
          id="session-error-title"
          tabIndex={-1}
          className="text-base font-medium"
        >
          Unable to check your session
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Check your connection and try again.
        </p>
        <Button type="button" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      </section>
    </main>
  )
}
