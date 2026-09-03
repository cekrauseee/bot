import { apiBaseUrl } from "@/lib/api"
import {
  parseActiveRun,
  type ActiveRun,
} from "@/features/conversation/run-subscription"

export function agentRunDiscoveryUrl(origin = window.location.origin) {
  const url = new URL(apiBaseUrl || origin, origin)
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
  url.pathname = `${url.pathname.replace(/\/$/, "")}/agent-runs/subscribe`
  return url.toString()
}

export function parseRunDiscovery(value: unknown): ActiveRun {
  if (typeof value !== "string")
    throw new Error("Invalid active run discovery.")
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error("Invalid active run discovery.")
  }
  const message =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  if (message?.version !== 2 || message.type !== "active_run.discovered")
    throw new Error("Invalid active run discovery.")
  const run = parseActiveRun(message.active_run)
  if (!run) throw new Error("Invalid active run discovery.")
  return run
}

export function subscribeToRunDiscovery(
  onRun: (run: ActiveRun) => void,
  onResync: () => void
) {
  let stopped = false
  let socket: WebSocket | null = null
  let timer: number | null = null
  let attempt = 0
  const stop = () => {
    stopped = true
    if (timer !== null) window.clearTimeout(timer)
    socket?.close()
  }
  const open = () => {
    if (stopped) return
    try {
      socket = new WebSocket(agentRunDiscoveryUrl())
    } catch {
      schedule()
      return
    }
    const current = socket
    current.onmessage = (message) => {
      if (stopped || socket !== current) return
      try {
        attempt = 0
        onRun(parseRunDiscovery(message.data))
      } catch {
        onResync()
      }
    }
    current.onerror = () => current.close()
    current.onclose = () => {
      if (socket === current) socket = null
      if (!stopped) onResync()
      schedule()
    }
  }
  const schedule = () => {
    if (stopped || timer !== null) return
    timer = window.setTimeout(
      () => {
        timer = null
        open()
      },
      Math.min(1000 * 2 ** attempt++, 10000)
    )
  }
  open()
  return stop
}
