import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

import { loadEnv } from "vite"

const envDir = path.resolve(import.meta.dirname, "../..")

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, envDir, "")
  const webUrl = new URL(env.WEB_BASE_URL ?? "http://localhost:5173")
  return {
    envDir,
    plugins: [react(), tailwindcss()],
    server: {
      port: Number(webUrl.port || 5173),
      strictPort: true,
    },
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "./src"),
      },
    },
  }
})
