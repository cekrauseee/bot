import { ChevronDownIcon, ExternalLinkIcon, UnplugIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { OpenAILogo } from "@/components/ui/openai-logo"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import type {
  LoginStart,
  ProviderConnection,
} from "@/features/provider-connections/api"
import {
  codexProvider,
  formatResetDate,
  planLabel,
  usageWindow,
} from "@/features/provider-connections/model"

export type ProviderConnectionCardProps = {
  connection: ProviderConnection
  loading: boolean
  login: LoginStart | null
  onCancel: () => void
  onConnect: () => void
  onDisconnect: () => void
  onActiveChange: (active: boolean) => void
}

function ProviderIdentity() {
  return (
    <>
      <OpenAILogo className="size-4 shrink-0" />
      <span className="truncate font-medium">{codexProvider.displayName}</span>
      <span className="shrink-0 text-xs text-muted-foreground">
        {codexProvider.productName}
      </span>
    </>
  )
}

function ConnectedProviderDetails({
  connection,
  loading,
  onDisconnect,
}: Pick<
  ProviderConnectionCardProps,
  "connection" | "loading" | "onDisconnect"
>) {
  const window = usageWindow(connection)

  return (
    <>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Account</dt>
        <dd className="truncate text-right">
          {connection.account?.email ?? "Unavailable"}
        </dd>
        <dt className="text-muted-foreground">Plan</dt>
        <dd className="text-right">
          {planLabel(connection.account?.plan_type)}
        </dd>
        <dt className="text-muted-foreground">Usage</dt>
        <dd className="text-right font-medium tabular-nums">
          {window ? `${Math.round(window.used_percent)}%` : "Unavailable"}
        </dd>
        <dt className="text-muted-foreground">Resets</dt>
        <dd className="text-right tabular-nums">
          {formatResetDate(window?.resets_at ?? null)}
        </dd>
      </dl>
      <Button variant="outline" onClick={onDisconnect} disabled={loading}>
        {loading ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <UnplugIcon data-icon="inline-start" />
        )}
        Disconnect
      </Button>
    </>
  )
}

function PendingProviderDetails({
  connection,
  loading,
  login,
  onCancel,
}: Pick<
  ProviderConnectionCardProps,
  "connection" | "loading" | "login" | "onCancel"
>) {
  if (connection.status === "unavailable") {
    return (
      <p role="alert" className="text-destructive">
        OpenAI connections are unavailable on this server.
      </p>
    )
  }

  if (!login) return null

  return (
    <>
      {login.type === "browser" && (
        <>
          <p>Complete sign-in in the OpenAI window.</p>
          <Button
            render={
              <a href={login.auth_url} target="_blank" rel="noreferrer" />
            }
            nativeButton={false}
            variant="link"
            className="justify-start px-0"
          >
            Open sign-in page
          </Button>
        </>
      )}
      {login.type === "device_code" && (
        <>
          <p>Open the verification page and enter this code:</p>
          <Input
            aria-label="Codex device code"
            value={login.user_code}
            readOnly
          />
          <Button
            render={
              <a
                href={login.verification_url}
                target="_blank"
                rel="noreferrer"
              />
            }
            nativeButton={false}
            variant="outline"
          >
            <ExternalLinkIcon data-icon="inline-start" />
            Open verification page
          </Button>
        </>
      )}
      <p className="text-xs text-muted-foreground">Waiting for confirmation…</p>
      <Button variant="outline" onClick={onCancel} disabled={loading}>
        Cancel connection
      </Button>
    </>
  )
}

export function CodexProviderCard({
  connection,
  loading,
  login,
  onCancel,
  onConnect,
  onDisconnect,
  onActiveChange,
}: ProviderConnectionCardProps) {
  if (connection.status === "disconnected") {
    return (
      <Card className="gap-0 py-0 ring-0">
        <CardContent className="flex h-8 items-center gap-2 px-2 py-0">
          <ProviderIdentity />
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={onConnect}
            disabled={loading}
          >
            Connect
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Collapsible defaultOpen={connection.status === "connected"}>
      <Card className="gap-0 py-0 ring-0">
        <CardHeader className="flex items-center gap-1 p-0">
          <CollapsibleTrigger className="group/provider flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
            <ProviderIdentity />
            <ChevronDownIcon
              aria-hidden="true"
              className="ml-auto size-4 shrink-0 text-muted-foreground transition-[color,transform] duration-150 group-hover/provider:text-foreground group-data-[panel-open]/provider:rotate-180 motion-reduce:transition-none"
            />
          </CollapsibleTrigger>
          {connection.status === "connected" && (
            <Switch
              aria-label={`${codexProvider.displayName} ${codexProvider.productName}`}
              checked={connection.active}
              disabled={loading}
              onCheckedChange={onActiveChange}
              className="mr-2"
            />
          )}
        </CardHeader>
        <CollapsibleContent className="mt-2">
          <Separator />
          <CardContent className="flex flex-col gap-4 py-4">
            {connection.status === "connected" ? (
              <ConnectedProviderDetails
                connection={connection}
                loading={loading}
                onDisconnect={onDisconnect}
              />
            ) : (
              <div className="flex flex-col gap-3 text-sm">
                <PendingProviderDetails
                  connection={connection}
                  loading={loading}
                  login={login}
                  onCancel={onCancel}
                />
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}
