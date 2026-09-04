/// <reference types="vite/client" />

interface Window {
  myBotDesktop?: {
    getPlatformInfo(): Promise<{ platform: string; version: string }>
    startBrowserSignIn(): Promise<void>
    clearDesktopSession(): Promise<void>
    openExternalUrl(url: string): Promise<void>
    focusDesktopApp(): Promise<void>
    onProviderConnectionCallback(
      listener: (result: {
        provider: "github"
        status: "connected" | "error"
      }) => void
    ): () => void
  }
}
