import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const envDir = path.resolve(import.meta.dirname, '../..')
  const environment = loadEnv(mode, envDir, '')
  if (!environment.WEB_BASE_URL) throw new Error('WEB_BASE_URL is required')
  const webOrigin = new URL(environment.WEB_BASE_URL)

  return {
    envDir,
    server: {
      host: webOrigin.hostname,
      port: 5174,
      strictPort: true,
    },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, './src'),
      },
    },
  }
})
