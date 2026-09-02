import { useCallback, useEffect, useRef, useState } from "react"
import {
  ChevronDownIcon,
  ExternalLinkIcon,
  LinkIcon,
  LogOutIcon,
  UnplugIcon,
} from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { SidebarMenuButton } from "@/components/ui/sidebar"
import { apiErrorMessage } from "@/lib/api"
import {
  providerConnectionsApi,
  type ConnectionWindow,
  type LoginStart,
  type ProviderConnection,
} from "@/features/provider-connections/api"

type AccountMenuProps = {
  user: {
    email: string
    first_name: string | null
    last_name: string | null
    avatar_url: string | null
  }
  onSignOut: () => void
  signingOut: boolean
}

function userName(user: AccountMenuProps["user"]) {
  return (
    [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email
  )
}

function initials(user: AccountMenuProps["user"]) {
  return (
    [user.first_name, user.last_name]
      .filter(Boolean)
      .map((part) => part?.[0])
      .join("") || user.email[0]
  ).toUpperCase()
}

function limitText(window: ConnectionWindow | null) {
  if (!window) return null
  const duration = window.window_duration_minutes
    ? ` / ${window.window_duration_minutes} min`
    : ""
  const reset = window.resets_at
    ? ` · resets ${new Date(window.resets_at).toLocaleString()}`
    : ""
  return `${Math.round(window.used_percent)}% used${duration}${reset}`
}

function statusText(status: ProviderConnection["status"]) {
  if (status === "connected") return "Connected"
  if (status === "connecting") return "Connecting"
  if (status === "unavailable") return "Unavailable"
  return "Not connected"
}

function Limits({ connection }: { connection: ProviderConnection }) {
  if (!connection.limits) return null
  return (
    <div className="flex flex-col gap-1 text-xs text-muted-foreground">
      <span>Limits{connection.limits.reached ? " · reached" : ""}</span>
      {connection.limits.primary && (
        <span>Primary: {limitText(connection.limits.primary)}</span>
      )}
      {connection.limits.secondary && (
        <span>Secondary: {limitText(connection.limits.secondary)}</span>
      )}
    </div>
  )
}

export function AccountMenu({ user, onSignOut, signingOut }: AccountMenuProps) {
  const [connection, setConnection] = useState<ProviderConnection | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [browserFallback, setBrowserFallback] = useState(false)
  const [login, setLogin] = useState<LoginStart | null>(null)
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeLoginId = useRef<string | null>(null)

  const loadConnection = useCallback(async () => {
    try {
      setConnection(await providerConnectionsApi.get())
    } catch (loadError) {
      setConnection({
        status: "unavailable",
        account: null,
        limits: null,
        // The server did not provide a connection mode; browser is only an
        // unreachable fallback for the unavailable state.
        login_mode: "browser",
      })
      setError(
        apiErrorMessage(
          loadError,
          "Unable to load the OpenAI connection. Try again."
        )
      )
    }
  }, [])

  useEffect(() => {
    void Promise.resolve().then(loadConnection)
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current)
      activeLoginId.current = null
    }
  }, [loadConnection])

  const pollLogin = useCallback(async (loginId: string) => {
    async function poll() {
      try {
        const result = await providerConnectionsApi.getLoginStatus(loginId)
        if (activeLoginId.current !== loginId) return
        if (result.status === "pending") {
          pollTimer.current = setTimeout(() => void poll(), 2000)
        } else if (result.status === "connected") {
          activeLoginId.current = null
          setConnection(
            result.connection ?? (await providerConnectionsApi.get())
          )
          setLogin(null)
          setLoading(false)
        } else {
          activeLoginId.current = null
          setError(result.message ?? "Unable to connect OpenAI. Try again.")
          setLogin(null)
          setConnection(
            (current) =>
              current && {
                ...current,
                status: "disconnected",
                account: null,
                limits: null,
              }
          )
          setLoading(false)
        }
      } catch (pollError) {
        if (activeLoginId.current !== loginId) return
        activeLoginId.current = null
        setError(
          apiErrorMessage(
            pollError,
            "Unable to check the OpenAI connection. Try again."
          )
        )
        setLogin(null)
        setConnection(
          (current) =>
            current && {
              ...current,
              status: "disconnected",
              account: null,
              limits: null,
            }
        )
        setLoading(false)
      }
    }
    await poll()
  }, [])

  const connect = async () => {
    const mode = connection?.login_mode
    const popup = mode === "browser" ? window.open("", "_blank") : null
    setBrowserFallback(mode === "browser" && !popup)
    setLoading(true)
    setError(null)
    try {
      const result = await providerConnectionsApi.startLogin()
      activeLoginId.current = result.login_id
      if (result.type === "browser") {
        setLogin(result)
        if (popup) {
          popup.opener = null
          popup.location.href = result.auth_url
        }
      } else {
        popup?.close()
        setLogin(result)
      }
      // Polling is background work; cancellation must remain available.
      setLoading(false)
      void pollLogin(result.login_id)
    } catch (connectError) {
      popup?.close()
      setError(
        apiErrorMessage(
          connectError,
          "Unable to start the OpenAI connection. Try again."
        )
      )
      setLoading(false)
    }
  }

  const cancel = async () => {
    if (!login) return
    setLoading(true)
    setError(null)
    if (pollTimer.current) clearTimeout(pollTimer.current)
    activeLoginId.current = null
    try {
      await providerConnectionsApi.cancelLogin(login.login_id)
      setLogin(null)
      setConnection((current) =>
        current ? { ...current, status: "disconnected" } : current
      )
    } catch (cancelError) {
      setError(
        apiErrorMessage(
          cancelError,
          "Unable to cancel the connection. Try again."
        )
      )
    } finally {
      setLoading(false)
    }
  }

  const disconnect = async () => {
    setLoading(true)
    setError(null)
    try {
      await providerConnectionsApi.disconnect()
      setConnection({
        status: "disconnected",
        account: null,
        limits: null,
        login_mode: connection?.login_mode ?? "browser",
      })
    } catch (disconnectError) {
      setError(
        apiErrorMessage(
          disconnectError,
          "Unable to disconnect OpenAI. Try again."
        )
      )
    } finally {
      setLoading(false)
    }
  }

  const status = connection?.status ?? "connecting"
  const canConnect = status === "disconnected" && !login
  const canResume = connection !== null && status === "connecting" && !login

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <SidebarMenuButton
              tooltip={userName(user)}
              className="data-open:bg-sidebar-accent"
            />
          }
          aria-label={`Account menu for ${userName(user)}`}
        >
          <span className="relative grid size-4 shrink-0 place-items-center">
            <Avatar size="sm" className="absolute size-6 rounded-md">
              {user.avatar_url && (
                <AvatarImage
                  src={user.avatar_url}
                  alt=""
                  className="rounded-md"
                />
              )}
              <AvatarFallback className="rounded-md">
                {initials(user)}
              </AvatarFallback>
            </Avatar>
          </span>
          <span className="min-w-0 flex-1 truncate text-left group-data-[collapsible=icon]:hidden">
            {userName(user)}
          </span>
          <ChevronDownIcon
            aria-hidden="true"
            className="ml-auto group-data-[collapsible=icon]:hidden"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="top"
          align="start"
          sideOffset={8}
          className="min-w-60"
        >
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => setDialogOpen(true)}>
              <LinkIcon aria-hidden="true" />
              <span>OpenAI Codex</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {statusText(status)}
              </span>
            </DropdownMenuItem>
            {status === "connected" && connection && (
              <DropdownMenuLabel className="flex flex-col gap-1">
                <span className="flex flex-col gap-1 py-0.5">
                  <span className="text-xs">
                    {connection.account?.email ?? "Connected"}
                  </span>
                  <Limits connection={connection} />
                </span>
              </DropdownMenuLabel>
            )}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem disabled={signingOut} onClick={onSignOut}>
              {signingOut ? (
                <Spinner aria-hidden="true" />
              ) : (
                <LogOutIcon aria-hidden="true" />
              )}
              <span>Sign out</span>
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>OpenAI Codex connection</DialogTitle>
            <DialogDescription>
              Connect your OpenAI account to use your Codex subscription in
              myBot.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3" aria-live="polite">
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            {status === "unavailable" && (
              <p>OpenAI connections are unavailable on this server.</p>
            )}
            {canConnect && <p>Connect your OpenAI account to continue.</p>}
            {canResume && <p>Continue the pending OpenAI connection.</p>}
            {login?.type === "browser" && (
              <>
                <p>Complete sign-in in the OpenAI window.</p>
                {browserFallback && (
                  <Button
                    render={
                      <a
                        href={login.auth_url}
                        target="_blank"
                        rel="noreferrer"
                      />
                    }
                    nativeButton={false}
                    variant="link"
                    className="justify-start px-0"
                  >
                    Open sign-in page
                  </Button>
                )}
                <p className="text-xs text-muted-foreground">
                  Waiting for confirmation…
                </p>
              </>
            )}
            {login?.type === "device_code" && (
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
                  <ExternalLinkIcon data-icon="inline-start" /> Open
                  verification page
                </Button>
                <p className="text-xs text-muted-foreground">
                  Waiting for confirmation…
                </p>
              </>
            )}
            {login && (
              <Button
                variant="outline"
                onClick={() => void cancel()}
                disabled={loading}
              >
                Cancel connection
              </Button>
            )}
            {status === "connected" && connection && (
              <div className="flex flex-col gap-2">
                <p>
                  Connected as{" "}
                  {connection.account?.email ?? "your OpenAI account"}.
                </p>
                <p className="text-sm text-muted-foreground">
                  Plan: {connection.account?.plan_type ?? "Unavailable"}
                </p>
                <Limits connection={connection} />
              </div>
            )}
          </div>
          <DialogFooter>
            {canConnect && (
              <Button onClick={() => void connect()} disabled={loading}>
                {loading && <Spinner data-icon="inline-start" />} Connect OpenAI
              </Button>
            )}
            {canResume && (
              <Button onClick={() => void connect()} disabled={loading}>
                {loading && <Spinner data-icon="inline-start" />} Continue
              </Button>
            )}
            {status === "connected" && (
              <Button
                variant="destructive"
                onClick={() => void disconnect()}
                disabled={loading}
              >
                {loading ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <UnplugIcon data-icon="inline-start" />
                )}
                Disconnect OpenAI
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
