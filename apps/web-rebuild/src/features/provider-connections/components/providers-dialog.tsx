import type { ReactNode } from "react"
import { SlidersHorizontalIcon } from "lucide-react"

import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import { useProviderConnection } from "@/features/provider-connections/hooks/use-provider-connection"
import {
  providerUiRegistry,
  type ProviderUiRegistration,
} from "@/features/provider-connections/registry"

type ProvidersDialogProps = {
  children: ReactNode
}

export function ProvidersDialogTrigger() {
  return (
    <DialogTrigger render={<DropdownMenuItem />}>
      <SlidersHorizontalIcon aria-hidden="true" />
      <span>Providers</span>
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
        <p role="alert" className="p-4 pb-0 text-sm text-destructive">
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
        <div className="flex items-center gap-3 p-4 text-sm text-muted-foreground">
          <Spinner aria-hidden="true" />
          Loading provider status
        </div>
      )}
    </div>
  )
}

export function ProvidersDialog({ children }: ProvidersDialogProps) {
  return (
    <Dialog>
      {children}
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Providers</DialogTitle>
        </DialogHeader>
        <Separator />
        <div className="flex max-h-[min(36rem,calc(100vh-8rem))] flex-col gap-2 overflow-y-auto">
          {providerUiRegistry.map((registration) => (
            <ProviderConnectionEntry
              key={registration.connectionId}
              registration={registration}
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
