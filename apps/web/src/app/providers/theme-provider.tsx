import type { PropsWithChildren } from 'react'
import { ThemeProvider as NextThemesProvider } from 'next-themes'

export function ThemeProvider({ children }: PropsWithChildren) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableColorScheme
      enableSystem
      storageKey="my-bot-theme"
    >
      {children}
    </NextThemesProvider>
  )
}
