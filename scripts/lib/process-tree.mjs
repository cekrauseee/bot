import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

export function descendantProcesses(rows, rootPid) {
  const childrenByParent = new Map()
  for (const row of rows) {
    const children = childrenByParent.get(row.ppid) ?? []
    children.push(row.pid)
    childrenByParent.set(row.ppid, children)
  }

  const descendants = []
  const visit = (parentPid, depth) => {
    for (const pid of childrenByParent.get(parentPid) ?? []) {
      descendants.push({ pid, depth })
      visit(pid, depth + 1)
    }
  }
  visit(rootPid, 1)
  return descendants.sort((left, right) => right.depth - left.depth)
}

export function parseProcessTable(output) {
  return output
    .trim()
    .split('\n')
    .map((line) => line.trim().split(/\s+/, 2).map(Number))
    .filter(([pid, ppid]) => Number.isInteger(pid) && pid > 0 && Number.isInteger(ppid) && ppid >= 0)
    .map(([pid, ppid]) => ({ pid, ppid }))
}

async function processTable() {
  const { stdout } = await exec('ps', ['-axo', 'pid=,ppid='])
  return parseProcessTable(stdout)
}

function signalProcess(pid, signal) {
  try {
    process.kill(pid, signal)
    return true
  } catch (error) {
    if (error.code === 'ESRCH') return false
    throw error
  }
}

function processIsRunning(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if (error.code === 'ESRCH') return false
    throw error
  }
}

export async function terminateDescendants(
  rootPid,
  { signal = 'SIGTERM', graceMilliseconds = 2_000 } = {},
) {
  if (process.platform === 'win32') return

  const tracked = new Set()
  const discoverAndSignal = async (nextSignal) => {
    const descendants = descendantProcesses(await processTable(), rootPid)
    for (const { pid } of descendants) tracked.add(pid)
    for (const { pid } of descendants) signalProcess(pid, nextSignal)
  }

  await discoverAndSignal(signal)
  const deadline = Date.now() + graceMilliseconds
  while (Date.now() < deadline) {
    const running = [...tracked].filter(processIsRunning)
    if (running.length === 0) return
    await delay(50)
    await discoverAndSignal(signal)
  }

  for (const pid of tracked) {
    if (processIsRunning(pid)) signalProcess(pid, 'SIGKILL')
  }
}
