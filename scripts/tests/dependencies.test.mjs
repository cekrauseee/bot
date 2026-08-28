import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  dependenciesAreInstalled,
  dependencyFingerprint,
  dependencyMarkerName,
} from '../lib/development.mjs'

async function fixture(context) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'mybot-dependencies-'))
  context.after(() => rm(root, { force: true, recursive: true }))
  await mkdir(path.join(root, 'node_modules'), { recursive: true })
  await mkdir(path.join(root, 'apps/api'), { recursive: true })
  await mkdir(path.join(root, 'apps/web'), { recursive: true })
  await mkdir(path.join(root, 'apps/emails'), { recursive: true })
  await mkdir(path.join(root, 'apps/ai/.venv'), { recursive: true })
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ workspaces: ['apps/api', 'apps/web', 'apps/emails'] }),
  )
  await writeFile(path.join(root, 'package-lock.json'), '{"lockfileVersion":3}')
  await writeFile(path.join(root, 'apps/ai/pyproject.toml'), '[project]\nname = "ai"\n')
  await writeFile(path.join(root, 'apps/ai/uv.lock'), 'version = 1\n')
  await writeFile(path.join(root, 'apps/ai/.python-version'), '3.14\n')
  for (const workspace of ['api', 'web', 'emails']) {
    await writeFile(path.join(root, `apps/${workspace}/package.json`), `{"name":"${workspace}"}`)
  }
  await writeFile(path.join(root, 'node_modules/.package-lock.json'), '{}')
  await writeFile(path.join(root, 'apps/ai/.venv/pyvenv.cfg'), 'home = test\n')
  return root
}

test('dependency readiness requires a marker matching the workspace graph', async (context) => {
  const root = await fixture(context)
  const fingerprint = await dependencyFingerprint(root)

  assert.equal(await dependenciesAreInstalled(root), false)
  await writeFile(
    path.join(root, 'node_modules', dependencyMarkerName),
    JSON.stringify({ fingerprint }),
  )
  assert.equal(await dependenciesAreInstalled(root), true)

  await writeFile(path.join(root, 'package-lock.json'), '{"lockfileVersion":3,"changed":true}')
  assert.equal(await dependenciesAreInstalled(root), false)
})

test('workspace manifest changes invalidate the dependency marker', async (context) => {
  const root = await fixture(context)
  const markerPath = path.join(root, 'node_modules', dependencyMarkerName)
  await writeFile(markerPath, JSON.stringify({ fingerprint: await dependencyFingerprint(root) }))

  await writeFile(path.join(root, 'apps/api/package.json'), '{"name":"api","changed":true}')
  assert.notEqual(JSON.parse(await readFile(markerPath, 'utf8')).fingerprint, await dependencyFingerprint(root))
  assert.equal(await dependenciesAreInstalled(root), false)
})

test('Python dependency manifests invalidate the dependency marker', async (context) => {
  const root = await fixture(context)
  const markerPath = path.join(root, 'node_modules', dependencyMarkerName)
  await writeFile(markerPath, JSON.stringify({ fingerprint: await dependencyFingerprint(root) }))

  await writeFile(path.join(root, 'apps/ai/pyproject.toml'), '[project]\nname = "changed"\n')
  assert.equal(await dependenciesAreInstalled(root), false)

  await writeFile(markerPath, JSON.stringify({ fingerprint: await dependencyFingerprint(root) }))
  await writeFile(path.join(root, 'apps/ai/uv.lock'), 'version = 2\n')
  assert.equal(await dependenciesAreInstalled(root), false)

  await writeFile(markerPath, JSON.stringify({ fingerprint: await dependencyFingerprint(root) }))
  await writeFile(path.join(root, 'apps/ai/.python-version'), '3.15\n')
  assert.equal(await dependenciesAreInstalled(root), false)
})
