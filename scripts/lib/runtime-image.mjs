import path from 'node:path'

import { projectRoot } from './project.mjs'
import { run } from './process.mjs'

export const developmentRuntimeImage = 'my-bot-runtime-dev:latest'

export async function buildDevelopmentRuntimeImage() {
  await run(
    'docker',
    [
      'build',
      '--tag', developmentRuntimeImage,
      '--file', path.join(projectRoot, 'apps/runtime/Dockerfile.dev'),
      path.join(projectRoot, 'apps/runtime'),
    ],
    { label: 'Prepare the local agent runtime image' },
  )
}
