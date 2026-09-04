import { useEffect } from "react"
import { Navigate, useParams, useSearchParams } from "react-router-dom"

import { ProviderConnectionResultCard } from "@/features/provider-connections/components/provider-connection-result"
import { providerUiRegistry } from "@/features/provider-connections/registry"

export default function ConnectionCallbackPage() {
  const { connectionId } = useParams()
  const [searchParams] = useSearchParams()
  const status = searchParams.get("status")
  const target = searchParams.get("target")
  const registration = providerUiRegistry.find(
    (candidate) => candidate.connectionId === connectionId
  )
  const desktopCallbackUrl =
    connectionId === "github" &&
    target === "desktop" &&
    (status === "connected" || status === "error")
      ? `mybot://connections/github/callback?status=${status}`
      : null

  useEffect(() => {
    if (!desktopCallbackUrl) return
    const redirect = window.setTimeout(
      () => window.location.assign(desktopCallbackUrl),
      0
    )
    return () => window.clearTimeout(redirect)
  }, [desktopCallbackUrl])

  if (
    !registration?.completionPresentations.includes("callback-page") ||
    (status !== "connected" && status !== "error") ||
    (target !== null && target !== "desktop")
  ) {
    return <Navigate to="/" replace />
  }

  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <ProviderConnectionResultCard
        providerName={registration.providerName}
        status={status}
        desktopHandoff={desktopCallbackUrl !== null}
        action={
          desktopCallbackUrl
            ? { type: "link", href: desktopCallbackUrl, label: "Open Bot" }
            : {
                type: "button",
                onClick: () => window.close(),
                label: "Close window",
              }
        }
      />
    </main>
  )
}
