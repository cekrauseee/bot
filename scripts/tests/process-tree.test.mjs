import assert from 'node:assert/strict'
import test from 'node:test'

import { descendantProcesses, parseProcessTable } from '../lib/process-tree.mjs'

test('parses the process table and orders descendants deepest first', () => {
  const rows = parseProcessTable(`
    100 1
    110 100
    120 110
    130 100
    invalid row
  `)

  assert.deepEqual(descendantProcesses(rows, 100), [
    { pid: 120, depth: 2 },
    { pid: 110, depth: 1 },
    { pid: 130, depth: 1 },
  ])
})

test('does not include unrelated processes or the root process', () => {
  const rows = parseProcessTable('100 1\n110 100\n200 1\n210 200\n')
  assert.deepEqual(descendantProcesses(rows, 100), [{ pid: 110, depth: 1 }])
})
