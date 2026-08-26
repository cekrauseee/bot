import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { commandNames, commandSections } from '../lib/commands.mjs'
import { projectRoot } from '../lib/project.mjs'

test('package scripts follow the documented semantic order', async () => {
  const packageJson = JSON.parse(await readFile(`${projectRoot}/package.json`, 'utf8'))

  assert.deepEqual(Object.keys(packageJson.scripts), commandNames)
})

test('every command has one concise description', () => {
  const commands = commandSections.flatMap(({ commands }) => commands)
  const uniqueNames = new Set(commands.map(([name]) => name))

  assert.equal(uniqueNames.size, commands.length)
  for (const [name, description] of commands) {
    assert.match(name, /^[a-z]+(?::[a-z]+)*$/)
    assert.ok(description.length > 0 && description.length <= 72)
  }
})
