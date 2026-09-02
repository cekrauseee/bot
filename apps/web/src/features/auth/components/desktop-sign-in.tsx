import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type DesktopState = "idle" | "opening" | "waiting" | "error"

export function DesktopSignIn() {
  const [state, setState] = useState<DesktopState>(() =>
    new URLSearchParams(window.location.search).get("desktop") === "success" ? "waiting" : "idle"
  )
  const [error, setError] = useState("")

  const continueInBrowser = async () => {
    if (!window.myBotDesktop || state === "opening" || state === "waiting") return
    setState("opening")
    setError("")
    try {
      setState("waiting")
      await window.myBotDesktop.startBrowserSignIn()
      window.location.assign("/")
    } catch {
      setState("error")
      setError("We couldn’t complete browser sign-in. Please try again.")
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle><h1>Sign in to myBot</h1></CardTitle>
        <CardDescription>Continue in your browser to securely sign in with Google or email.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Button className="w-full" onClick={continueInBrowser} disabled={state === "opening" || state === "waiting"}>
          {state === "opening" ? "Opening browser…" : state === "waiting" ? "Waiting for browser sign-in…" : "Continue in browser"}
        </Button>
        <p className="text-muted-foreground text-center text-xs" role="status" aria-live="polite">
          {error || (state === "waiting" ? "Finish signing in in the browser window. This screen will continue automatically." : "")}
        </p>
      </CardContent>
    </Card>
  )
}
