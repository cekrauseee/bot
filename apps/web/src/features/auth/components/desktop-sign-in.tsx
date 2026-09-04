import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type DesktopState = "idle" | "opening" | "waiting" | "error"

export function DesktopSignIn() {
  const [state, setState] = useState<DesktopState>(() =>
    new URLSearchParams(window.location.search).get("desktop") === "error"
      ? "error"
      : "idle"
  )

  const continueInBrowser = async () => {
    if (!window.myBotDesktop || state === "opening") return
    setState("opening")
    try {
      await window.myBotDesktop.startBrowserSignIn()
      setState("waiting")
    } catch {
      setState("error")
    }
  }

  const statusMessage =
    state === "error"
      ? "Unable to sign in. Try again."
      : state === "waiting"
        ? "Finish signing in in your browser."
        : null

  return (
    <Card className="w-full max-w-sm" size="sm">
      <CardHeader>
        <CardTitle><h1>Sign in to Bot</h1></CardTitle>
        <CardDescription>Use your browser to sign in.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Button className="w-full" onClick={continueInBrowser} disabled={state === "opening"}>
          {state === "opening" ? "Opening browser…" : state === "waiting" ? "Open browser again" : "Continue in browser"}
        </Button>
        {statusMessage && (
          <p className="text-muted-foreground text-center text-xs" role="status" aria-live="polite">
            {statusMessage}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
