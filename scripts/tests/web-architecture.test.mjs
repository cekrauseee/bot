import assert from 'node:assert/strict'
import { access, readFile, readdir } from 'node:fs/promises'
import test from 'node:test'

import { projectRoot } from '../lib/project.mjs'

const webSource = `${projectRoot}/apps/web/src`
const chatFeature = `${webSource}/features/chat`

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = `${directory}/${entry.name}`
      return entry.isDirectory() ? filesUnder(path) : [path]
    }),
  )
  return nested.flat()
}

test('pages consume only the public chat feature entrypoint', async () => {
  const homePage = await readFile(`${webSource}/pages/home/page.tsx`, 'utf8')

  assert.match(homePage, /from ['"]@\/features\/chat['"]/)
  assert.doesNotMatch(homePage, /from ['"]@\/features\/chat\//)
})

test('chat models and fixtures remain serializable and presentation-independent', async () => {
  const dataFiles = [
    `${chatFeature}/model.ts`,
    ...(await filesUnder(`${chatFeature}/fixtures`)),
  ]

  for (const file of dataFiles) {
    const source = await readFile(file, 'utf8')
    assert.doesNotMatch(source, /from ['"]react['"]/, file)
    assert.doesNotMatch(source, /@\/components\//, file)
    assert.doesNotMatch(source, /@\/features\/chat\/components\//, file)
  }
})

test('vendor-style chat structure and names cannot return', async () => {
  await assert.rejects(access(`${webSource}/components/agents`))

  const chatFiles = await filesUnder(chatFeature)
  for (const file of chatFiles) {
    const source = await readFile(file, 'utf8')
    assert.doesNotMatch(file, /chat-app|mock-conversations|approval-card|tool-result/)
    assert.doesNotMatch(source, /\bChatApp\b|beui\.dev\/components\/agents/)
  }
})

test('the chat public entrypoint contains exports only', async () => {
  const entrypoint = await readFile(`${chatFeature}/index.ts`, 'utf8')
  const statements = entrypoint
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  assert.ok(statements.every((line) => line.startsWith('export ')))
})
