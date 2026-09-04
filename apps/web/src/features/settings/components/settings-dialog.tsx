import type { ReactNode } from "react"
import { SettingsIcon } from "lucide-react"

import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { ProviderConnectionSkeleton } from "@/features/provider-connections/components/provider-connection-skeleton"
import { useProviderConnection } from "@/features/provider-connections/hooks/use-provider-connection"
import {
  providerUiRegistry,
  type ProviderUiRegistration,
} from "@/features/provider-connections/registry"

type SettingsDialogProps = {
  children: ReactNode
}

export function SettingsDialogTrigger() {
  return (
    <DialogTrigger render={<DropdownMenuItem />}>
      <SettingsIcon aria-hidden="true" />
      <span>Settings</span>
    </DialogTrigger>
  )
}

function ProviderConnectionEntry({
  registration,
}: {
  registration: ProviderUiRegistration
}) {
  const {
    connection,
    error,
    loading,
    login,
    cancel,
    connect,
    disconnect,
    setActive,
  } = useProviderConnection({
    api: registration.api,
    providerName: registration.providerName,
  })
  const ProviderCard = registration.Card

  return (
    <div>
      {error && (
        <p role="alert" className="px-3 pb-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {connection ? (
        <ProviderCard
          connection={connection}
          loading={loading}
          login={login}
          onCancel={() => void cancel()}
          onConnect={() => void connect()}
          onDisconnect={() => void disconnect()}
          onActiveChange={(active) => void setActive(active)}
        />
      ) : (
        <ProviderConnectionSkeleton />
      )}
    </div>
  )
}

export function SettingsDialog({ children }: SettingsDialogProps) {
  return (
    <Dialog>
      {children}
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Manage model access and connected services.
          </DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[min(36rem,calc(100vh-8rem))] flex-col gap-6 overflow-y-auto">
          <section
            aria-labelledby="model-providers-heading"
            className="flex flex-col gap-2"
          >
            <h2 id="model-providers-heading" className="text-sm font-medium">
              Model provider
            </h2>
            <div className="flex flex-col gap-2">
              {providerUiRegistry
                .filter(
                  (registration) => registration.connectionId !== "github"
                )
                .map((registration) => (
                  <ProviderConnectionEntry
                    key={registration.connectionId}
                    registration={registration}
                  />
                ))}
            </div>
          </section>
          <section
            aria-labelledby="integrations-heading"
            className="flex flex-col gap-2"
          >
            <h2 id="integrations-heading" className="text-sm font-medium">
              Integrations
            </h2>
            <ProviderConnectionEntry
              registration={providerUiRegistry.find(
                (registration) => registration.connectionId === "github"
              )!}
            />
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
