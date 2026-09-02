import { pathToFileURL } from 'node:url'

import { createRuntimeServer } from './http.js'
import { loadConfig } from './config.js'
import { RuntimeService } from './service.js'
import { runtimeLogger } from './logger.js'

export function createApplication(env: NodeJS.ProcessEnv = process.env) {
  const config = loadConfig(env)
  const service = new RuntimeService({ providerFactory: config.providerFactory })
  return {
    config,
    service,
    server: createRuntimeServer({
      service,
      serviceToken: config.serviceToken,
      isReady: () => config.providerReady,
      unavailableReason: () => config.providerUnavailableReason,
    }),
  }
}

const isEntryPoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isEntryPoint) {
  const application = createApplication()
  application.server.listen(application.config.port, '0.0.0.0', () => {
    runtimeLogger({ event: 'runtime_started', port: application.config.port }, 'runtime_started')
  })
  let shuttingDown = false
  const shutdown = async () => {
    if (shuttingDown) return
    shuttingDown = true
    await new Promise<void>((resolve, reject) => {
      application.server.close((error) => error ? reject(error) : resolve())
    })
    await application.service.dispose()
  }
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void shutdown().catch(() => { process.exitCode = 1 })
    })
  }
}
