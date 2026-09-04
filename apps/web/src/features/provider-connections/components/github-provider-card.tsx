import { ExternalLinkIcon, UnplugIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { GitHubLogo } from "@/components/ui/github-logo"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import type {
  LoginStart,
  ProviderConnection,
} from "@/features/provider-connections/api"

export type GithubProviderCardProps = {
  connection: ProviderConnection
  loading: boolean
  login: LoginStart | null
  onCancel: () => void
  onConnect: () => void
  onDisconnect: () => void
  onActiveChange: (active: boolean) => void
}

const identity = (connection: ProviderConnection) =>
  connection.account?.email ?? connection.account?.plan_type ?? "GitHub account"

export function GithubProviderCard({
  connection,
  loading,
  login,
  onCancel,
  onConnect,
  onDisconnect,
  onActiveChange,
}: GithubProviderCardProps) {
  if (connection.status === "unavailable") {
    return (
      <Card size="sm" className="ring-0">
        <CardContent className="flex min-h-10 items-center gap-2 px-3 py-2 text-sm">
          <GitHubLogo className="size-4 shrink-0" />
          <span className="font-medium">GitHub</span>
          <span className="ml-auto text-xs text-muted-foreground">
            Unavailable
          </span>
        </CardContent>
      </Card>
    )
  }

  if (connection.status === "disconnected" && !login) {
    return (
      <Card size="sm" className="ring-0">
        <CardContent className="flex min-h-10 items-center gap-2 px-3 py-2">
          <GitHubLogo className="size-4 shrink-0" />
          <span className="font-medium">GitHub</span>
          <Button
            className="ml-auto"
            size="sm"
            variant="outline"
            onClick={onConnect}
            disabled={loading}
          >
            {loading ? <Spinner data-icon="inline-start" /> : null}
            Connect
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (connection.status === "connecting" || login) {
    return (
      <Card size="sm" className="ring-0">
        <CardContent className="flex flex-col gap-3 px-3 py-3 text-sm">
          <div className="flex items-center gap-2">
            <GitHubLogo className="size-4 shrink-0" />
            <span className="font-medium">Connecting GitHub…</span>
          </div>
          {login?.type === "browser" ? (
            <Button
              render={
                <a href={login.auth_url} target="_blank" rel="noreferrer" />
              }
              nativeButton={false}
              variant="link"
              className="justify-start px-0"
            >
              <ExternalLinkIcon data-icon="inline-start" /> Open sign-in page
            </Button>
          ) : login?.type === "device_code" ? (
            <>
              <Input
                aria-label="GitHub device code"
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
                <ExternalLinkIcon data-icon="inline-start" /> Open verification
                page
              </Button>
            </>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Waiting for GitHub confirmation…
          </p>
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            Cancel connection
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card size="sm" className="ring-0">
      <CardContent className="flex min-h-10 items-center gap-2 px-3 py-2">
        <GitHubLogo className="size-4 shrink-0" />
        <div className="min-w-0 truncate">
          <p className="font-medium">GitHub</p>
          <p className="truncate text-xs text-muted-foreground">
            {identity(connection)}
          </p>
        </div>
        <Switch
          aria-label="GitHub integration"
          checked={connection.active}
          disabled={loading}
          onCheckedChange={onActiveChange}
          className="ml-auto"
        />
        <Button
          aria-label="Disconnect GitHub"
          size="icon-sm"
          variant="ghost"
          onClick={onDisconnect}
          disabled={loading}
        >
          {loading ? <Spinner /> : <UnplugIcon />}
        </Button>
      </CardContent>
    </Card>
  )
}
