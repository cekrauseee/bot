import { useCallback, useEffect, useRef, useState } from "react"

import type {
  LoginStart,
  ProviderConnectionApi,
  ProviderConnection,
} from "@/features/provider-connections/api"
import { apiErrorMessage } from "@/lib/api"

type ProviderConnectionState = {
  connection: ProviderConnection | null
  error: string | null
  loading: boolean
  login: LoginStart | null
  cancel: () => Promise<void>
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  setActive: (active: boolean) => Promise<void>
}

type UseProviderConnectionOptions = {
  api: ProviderConnectionApi
  providerName: string
}

export function useProviderConnection({
  api,
  providerName,
}: UseProviderConnectionOptions): ProviderConnectionState {
  const [connection, setConnection] = useState<ProviderConnection | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [login, setLogin] = useState<LoginStart | null>(null)
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeLoginId = useRef<string | null>(null)
  const loginMode = connection?.login_mode

  const loadConnection = useCallback(async () => {
    try {
      setConnection(await api.get())
    } catch (loadError) {
      setConnection({
        status: "unavailable",
        account: null,
        limits: null,
        login_mode: "browser",
        active: false,
      })
      setError(
        apiErrorMessage(
          loadError,
          `Unable to load the ${providerName} connection. Try again.`
        )
      )
    }
  }, [api, providerName])

  useEffect(() => {
    void Promise.resolve().then(loadConnection)
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current)
      activeLoginId.current = null
    }
  }, [loadConnection])

  const pollLogin = useCallback(
    async (loginId: string) => {
      async function poll() {
        try {
          const result = await api.getLoginStatus(loginId)
          if (activeLoginId.current !== loginId) return
          if (result.status === "pending") {
            pollTimer.current = setTimeout(() => void poll(), 2000)
          } else if (result.status === "connected") {
            activeLoginId.current = null
            setConnection(result.connection ?? (await api.get()))
            window.dispatchEvent(new Event("provider-connections:changed"))
            setLogin(null)
            setLoading(false)
          } else {
            activeLoginId.current = null
            setError(
              result.message ?? `Unable to connect ${providerName}. Try again.`
            )
            setLogin(null)
            setConnection(
              (current) =>
                current && {
                  ...current,
                  status: "disconnected",
                  account: null,
                  limits: null,
                  active: false,
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
              `Unable to check the ${providerName} connection. Try again.`
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
                active: false,
              }
          )
          setLoading(false)
        }
      }

      await poll()
    },
    [api, providerName]
  )

  const connect = useCallback(async () => {
    const mode = loginMode
    const popup = mode === "browser" ? window.open("", "_blank") : null
    setLoading(true)
    setError(null)

    try {
      const result = await api.startLogin()
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
      setLoading(false)
      void pollLogin(result.login_id)
    } catch (connectError) {
      popup?.close()
      setError(
        apiErrorMessage(
          connectError,
          `Unable to start the ${providerName} connection. Try again.`
        )
      )
      setLoading(false)
    }
  }, [api, loginMode, pollLogin, providerName])

  const cancel = useCallback(async () => {
    if (!login) return
    setLoading(true)
    setError(null)
    if (pollTimer.current) clearTimeout(pollTimer.current)
    activeLoginId.current = null

    try {
      await api.cancelLogin(login.login_id)
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
  }, [api, login])

  const disconnect = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      await api.disconnect()
      setConnection({
        status: "disconnected",
        account: null,
        limits: null,
        login_mode: loginMode ?? "browser",
        active: false,
      })
      window.dispatchEvent(new Event("provider-connections:changed"))
    } catch (disconnectError) {
      setError(
        apiErrorMessage(
          disconnectError,
          `Unable to disconnect ${providerName}. Try again.`
        )
      )
    } finally {
      setLoading(false)
    }
  }, [api, loginMode, providerName])

  const setActive = useCallback(
    async (active: boolean) => {
      setLoading(true)
      setError(null)

      try {
        setConnection(await api.setActive(active))
        window.dispatchEvent(new Event("provider-connections:changed"))
      } catch (updateError) {
        setError(
          apiErrorMessage(
            updateError,
            `Unable to ${active ? "enable" : "disable"} ${providerName}. Try again.`
          )
        )
      } finally {
        setLoading(false)
      }
    },
    [api, providerName]
  )

  return {
    connection,
    error,
    loading,
    login,
    cancel,
    connect,
    disconnect,
    setActive,
  }
}
