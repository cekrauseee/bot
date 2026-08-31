import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  developmentServices,
  formatDevelopmentPorts,
  inspectDevelopmentPorts,
  parsePortOwners,
} from '../lib/development-ports.mjs'

test('port preflight uses API settings without requiring or creating an environment file', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'mybot-ports-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  assert.deepEqual((await developmentServices(root, {})).map(({ port }) => port), [5173, 8000, 8001])

  await writeFile(path.join(root, '.env'), 'API_BASE_URL="http://localhost:8123" # local override\n')
  assert.equal((await developmentServices(root, {}))[1].port, 8123)
  assert.equal((await developmentServices(root, { API_BASE_URL: 'http://localhost:8234' }))[1].port, 8234)
  assert.equal((await developmentServices(root, { API_BASE_URL: 'http://localhost' }))[1].port, 8000)
})

for (const host of ['127.0.0.1', '::1']) {
  test(`detects a real ${host} listener without stopping it and releases its own probes`, async (t) => {
    const server = net.createServer()
    t.after(() => server.listening && new Promise((resolve) => server.close(resolve)))
    server.listen({ host, port: 0, ipv6Only: true })
    try {
      await once(server, 'listening')
    } catch (error) {
      if (host === '::1' && ['EAFNOSUPPORT', 'EADDRNOTAVAIL'].includes(error.code)) {
        t.skip('IPv6 loopback is unavailable')
        return
      }
      throw error
    }

    const port = server.address().port
    const services = [{ label: 'Fixture', port, hosts: ['127.0.0.1', '::1'] }]
    const [occupied] = await inspectDevelopmentPorts(services)
    assert.equal(occupied.status, 'occupied')
    assert.equal(server.listening, true)
    // lsof is optional, but any discovered owner must include this test process.
    if (occupied.owners.length) assert.ok(occupied.owners.some(({ pid }) => pid === process.pid))

    await new Promise((resolve) => server.close(resolve))
    const [available] = await inspectDevelopmentPorts(services)
    assert.equal(available.status, 'available')

    server.listen({ host, port, ipv6Only: true })
    await once(server, 'listening')
    assert.equal(server.address().port, port)
  })
}

test('reports every listener PID once, including reload workers sharing a socket', () => {
  const owners = parsePortOwners('p123\ncpython3.14\nf3\np456\ncpython3.14\nf3\np123\ncpython3.14\nf4\n')
  assert.deepEqual(owners, [{ pid: 123, command: 'python3.14' }, { pid: 456, command: 'python3.14' }])
  assert.deepEqual(parsePortOwners('p0\ncignored\npnot-a-pid\ncignored\n'), [])

  const log = formatDevelopmentPorts([
    { label: 'Web', port: 5173, status: 'available', owners: [] },
    { label: 'AI', port: 8001, status: 'occupied', owners },
    { label: 'API', port: 8000, status: 'occupied', owners: [owners[0]] },
  ], 'darwin')
  assert.match(log, /Web\s+5173\s+available/)
  assert.match(log, /AI\s+8001\s+occupied/)
  assert.match(log, /python3\.14 \(PID 456\)/)
  assert.match(log, /kill -TERM 123 456$/)
  assert.equal(log.match(/kill -TERM/g).length, 1)
  assert.doesNotMatch(log, /kill -9|kill -KILL/)
})

test('missing owner details still block startup and provide manual inspection commands', () => {
  const checks = [{ label: 'API', port: 8000, status: 'occupied', owners: [] }]
  const log = formatDevelopmentPorts(checks, 'linux')
  assert.match(log, /occupied/)
  assert.match(log, /PID unavailable/)
  assert.match(log, /lsof -nP -iTCP:8000 -sTCP:LISTEN/)
  const windowsLog = formatDevelopmentPorts(checks, 'win32')
  assert.match(windowsLog, /Get-NetTCPConnection -LocalPort 8000 -State Listen/)
  assert.doesNotMatch(windowsLog, /lsof|kill -TERM/)
})
