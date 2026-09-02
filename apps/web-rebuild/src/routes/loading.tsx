import { Spinner } from "@/components/ui/spinner"

export function RouteLoading() {
  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <Spinner aria-label="Loading application" />
    </main>
  )
}
