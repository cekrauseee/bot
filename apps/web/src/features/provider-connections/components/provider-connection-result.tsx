import { CircleCheckIcon, XIcon } from "lucide-react"

import { Alert, AlertAction, AlertTitle } from "@/components/ui/alert"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"

export type ProviderConnectionResultStatus = "connected" | "error"

function resultCopy(
  providerName: string,
  status: ProviderConnectionResultStatus
) {
  return status === "connected"
    ? {
        title: `${providerName} connected`,
        description: `${providerName} is ready to use in Bot.`,
      }
    : {
        title: `Unable to connect ${providerName}`,
        description: "Return to Bot and try again.",
      }
}

export function ProviderConnectionSuccessAlert({
  providerName,
  onDismiss,
}: {
  providerName: string
  onDismiss: () => void
}) {
  const copy = resultCopy(providerName, "connected")

  return (
    <Alert variant="success" role="status">
      <CircleCheckIcon aria-hidden="true" strokeWidth={1.5} />
      <AlertTitle>{copy.title}</AlertTitle>
      <AlertAction>
        <Button
          aria-label={`Dismiss ${providerName} connection success`}
          size="icon-xs"
          variant="ghost"
          onClick={onDismiss}
        >
          <XIcon aria-hidden="true" />
        </Button>
      </AlertAction>
    </Alert>
  )
}

export function ProviderConnectionResultCard({
  providerName,
  status,
  desktopHandoff = false,
  action,
}: {
  providerName: string
  status: ProviderConnectionResultStatus
  desktopHandoff?: boolean
  action:
    | { type: "link"; href: string; label: string }
    | { type: "button"; onClick: () => void; label: string }
}) {
  const copy = resultCopy(providerName, status)
  const description =
    status === "error"
      ? copy.description
      : desktopHandoff
        ? "Bot should open automatically."
        : "You can close this window."

  return (
    <Card className="w-full max-w-sm" size="sm">
      <CardHeader>
        <CardTitle>
          <h1>{copy.title}</h1>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {action.type === "link" ? (
          <a className={cn(buttonVariants(), "w-full")} href={action.href}>
            {action.label}
          </a>
        ) : (
          <Button className="w-full" onClick={action.onClick}>
            {action.label}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
