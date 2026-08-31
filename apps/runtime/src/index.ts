import { pathToFileURL } from 'node:url'

import { createRuntimeServer } from './http.js'
import { loadConfig } from './config.js'
import { RuntimeService } from './service.js'

export function createApplication(env: NodeJS.ProcessEnv = process.env) {
  const config = loadConfig(env)
  const service = new RuntimeService({ providerFactory: config.providerFactory })
  return {
    config,
    service,
    server: createRuntimeServer({ service, serviceToken: config.serviceToken, isReady: () => config.providerReady }),
  }
}

const isEntryPoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isEntryPoint) {
  const application = createApplication()
  application.server.listen(application.config.port, '0.0.0.0', () => {
    console.log(`runtime listening on ${application.config.port}`)
  })
}
