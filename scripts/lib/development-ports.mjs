import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { parseEnv, promisify } from 'node:util'

import { projectRoot } from './project.mjs'

const exec = promisify(execFile)

export async function developmentServices(root = projectRoot, env = process.env) {
  const values = parseEnv(await readFile(path.join(root, '.env'), 'utf8'))

  const origin = (key) => {
    const value = env[key] ?? values[key]
    if (!value) throw new Error(`${key} is required`)
    return new URL(value)
  }
  const port = (value) => Number(value.port || (value.protocol === 'https:' ? 443 : 80))

  const webOrigin = origin('WEB_BASE_URL')
  const apiOrigin = origin('API_BASE_URL')
  const aiOrigin = origin('AI_BASE_URL')
  const runtimeOrigin = origin('RUNTIME_BASE_URL')
  const runtimePort = Number(env.RUNTIME_PORT ?? values.RUNTIME_PORT)
  if (!Number.isInteger(runtimePort) || runtimePort < 1 || runtimePort > 65_535) {
    throw new Error('RUNTIME_PORT must be a valid TCP port')
  }
  if (runtimePort !== port(runtimeOrigin)) {
    throw new Error('RUNTIME_PORT must match RUNTIME_BASE_URL')
  }
  return [
    { label: 'Web rebuild', port: port(webOrigin), hosts: ['127.0.0.1', '::1'] },
    { label: 'Legacy web', port: 5174, hosts: ['127.0.0.1', '::1'] },
    { label: 'API', port: port(apiOrigin), hosts: ['0.0.0.0', '::'] },
    { label: 'AI', port: port(aiOrigin), hosts: ['127.0.0.1'] },
    { label: 'Runtime', port: runtimePort, hosts: ['0.0.0.0', '::'] },
  ]
}

function probePort(port, host) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', (error) => {
      if (error.code === 'EADDRINUSE') resolve({ status: 'occupied' })
      else if (host.includes(':') && ['EAFNOSUPPORT', 'EADDRNOTAVAIL'].includes(error.code)) {
        resolve({ status: 'unsupported' })
      } else resolve({ status: 'error', detail: `${host}: ${error.code}` })
    })
    // Probe each address family independently without the IPv6 probe reserving IPv4.
    server.listen({ port, host, ipv6Only: true, exclusive: true }, () => {
      server.close(() => resolve({ status: 'available' }))
    })
  })
}

export function parsePortOwners(output) {
  const owners = new Map()
  let pid
  for (const line of output.split('\n')) {
    if (line.startsWith('p')) {
      const value = Number(line.slice(1))
      pid = Number.isSafeInteger(value) && value > 0 ? value : undefined
      if (pid) owners.set(pid, { pid, command: 'unknown' })
    } else if (line.startsWith('c') && pid) {
      owners.get(pid).command = line.slice(1)
    }
  }
  return [...owners.values()]
}

async function portOwners(port) {
  try {
    const { stdout } = await exec('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fpc'], {
      timeout: 3_000,
    })
    return parsePortOwners(stdout)
  } catch {
    // Binding determines availability even when lsof is missing or cannot see the owner.
    return []
  }
}

export async function inspectDevelopmentPorts(services) {
  return Promise.all(services.map(async (service) => {
    const probes = await Promise.all(service.hosts.map((host) => probePort(service.port, host)))
    const occupied = probes.some(({ status }) => status === 'occupied')
    const error = probes.find(({ status }) => status === 'error')
    return {
      ...service,
      status: occupied ? 'occupied' : error ? 'error' : 'available',
      detail: error?.detail,
      owners: occupied ? await portOwners(service.port) : [],
    }
  }))
}

export function formatDevelopmentPorts(checks, platform = process.platform) {
  const labelWidth = Math.max('Service'.length, ...checks.map(({ label }) => label.length))
  const portWidth = Math.max('Port'.length, ...checks.map(({ port }) => String(port).length))
  const lines = [
    '\n→ Development ports',
    `    ${'Service'.padEnd(labelWidth)}  ${'Port'.padEnd(portWidth)}  Status`,
  ]
  for (const check of checks) {
    const available = check.status === 'available'
    const status = check.status === 'error' ? `cannot check (${check.detail})` : check.status
    const owners = check.owners.map(({ command, pid }) => `${command} (PID ${pid})`).join(', ')
    lines.push(`  ${available ? '✓' : '✗'} ${check.label.padEnd(labelWidth)}  ${String(check.port).padEnd(portWidth)}  ${status}${owners ? ` · ${owners}` : ''}`)
  }

  const conflicts = checks.filter(({ status }) => status === 'occupied')
  const pids = [...new Set(conflicts.flatMap(({ owners }) => owners.map(({ pid }) => pid)))]
  if (pids.length) {
    const command = platform === 'win32' ? `Stop-Process -Id ${pids.join(',')}` : `kill -TERM ${pids.join(' ')}`
    lines.push('', `  Stop (check PIDs first): ${command}`)
  }
  const unknown = conflicts.filter(({ owners }) => owners.length === 0)
  if (unknown.length) {
    const command = platform === 'win32'
      ? `Get-NetTCPConnection -LocalPort ${unknown.map(({ port }) => port).join(',')} -State Listen`
      : `lsof -nP ${unknown.map(({ port }) => `-iTCP:${port}`).join(' ')} -sTCP:LISTEN`
    lines.push('', `  PID unavailable. Inspect: ${command}`)
  }
  return lines.join('\n')
}

export async function assertDevelopmentPortsAvailable() {
  const checks = await inspectDevelopmentPorts(await developmentServices())
  console.log(formatDevelopmentPorts(checks))
  if (checks.some(({ status }) => status !== 'available')) {
    throw new Error('Free the ports and retry npm run dev.')
  }
}
