import { useEffect, useState } from "react"

import { buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { authApi } from "@/features/auth/api"
import { desktopCallbackUrl } from "@/features/auth/desktop-callback"
import { cn } from "@/lib/utils"

type HandoffState =
  | { status: "finishing" }
  | { status: "ready"; callbackUrl: string }
  | { status: "error" }

export function DesktopBrowserHandoff({ transactionId }: { transactionId: string }) {
  const [state, setState] = useState<HandoffState>({ status: "finishing" })

  useEffect(() => {
    let active = true
    let redirect: number | undefined

    void authApi
      .completeDesktop(transactionId)
      .then(({ callback_url }) => {
        const callbackUrl = desktopCallbackUrl(callback_url, transactionId)
        if (!active) return
        setState({ status: "ready", callbackUrl })
        redirect = window.setTimeout(() => window.location.assign(callbackUrl), 0)
      })
      .catch(() => {
        if (active) setState({ status: "error" })
      })

    return () => {
      active = false
      if (redirect !== undefined) window.clearTimeout(redirect)
    }
  }, [transactionId])

  if (state.status === "error") {
    return (
      <Card className="w-full max-w-sm" size="sm">
        <CardHeader role="alert">
          <CardTitle><h1>Unable to finish sign-in</h1></CardTitle>
          <CardDescription>Return to myBot and try again.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-sm" size="sm">
      <CardHeader>
        <CardTitle><h1>{state.status === "ready" ? "You’re signed in" : "Finishing sign-in"}</h1></CardTitle>
        <CardDescription>
          {state.status === "ready" ? "myBot should open automatically." : "This will only take a moment."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {state.status === "ready" ? (
          <a className={cn(buttonVariants(), "w-full")} href={state.callbackUrl}>
            Open myBot
          </a>
        ) : (
          <div className="flex justify-center" role="status">
            <Spinner aria-label="Finishing sign-in" />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
