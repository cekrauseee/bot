import { describe, expect, it } from 'vitest'

import {
  createDockerProviderFactory,
  deriveDockerResourceNames,
  type DockerCommandRunner,
} from '../src/providers/docker.js'

function result(exitCode = 0, stdout: string | Buffer = '', stderr = '') {
  return { exitCode, stdout: Buffer.from(stdout), stderr: Buffer.from(stderr) }
}

class DockerRunnerDouble implements DockerCommandRunner {
  readonly calls: Array<{ args: readonly string[]; input?: Buffer | string }> = []
  containerInspection: object | undefined

  async run(args: readonly string[], options: { input?: Buffer | string } = {}) {
    this.calls.push({ args: [...args], input: options.input })
    if (args[0] === 'image' && args[1] === 'inspect') return result(0, 'sha256:image\n')
    if (args[0] === 'container' && args[1] === 'inspect') {
      return this.containerInspection ? result(0, JSON.stringify([this.containerInspection])) : result(1)
    }
    if (args.some((argument) => argument.includes('readdirSync(directory'))) {
      return result(0, JSON.stringify([
        { name: 'notes.md', path: '/workspace/notes.md', type: 'file', size: 5 },
      ]))
    }
    const browserIndex = args.indexOf('agent-browser')
    if (browserIndex >= 0) {
      const screenshotIndex = args.indexOf('screenshot', browserIndex)
      if (screenshotIndex >= 0) {
        return result(0, JSON.stringify({ data: { path: args[screenshotIndex + 1] } }))
      }
      return result(0, JSON.stringify({ data: { ok: true } }))
    }
    if (
      args.some((argument) => argument.includes("readFileSync(process.argv[1])"))
      && args.at(-1)?.startsWith('/tmp/browser-frame-')
    ) return result(0, Buffer.from('png'))
    return result()
  }
}

describe('Docker runtime provider', () => {
  it('derives deterministic resource names without exposing workspace identifiers', () => {
    const names = deriveDockerResourceNames('Development / Local', 'user/workspace/private')
    expect(names).toEqual(deriveDockerResourceNames('Development / Local', 'user/workspace/private'))
    expect(names.container).toMatch(/^development-local-[a-f0-9]{16}$/)
    expect(JSON.stringify(names)).not.toContain('private')
  })

  it('creates a hardened persistent container and lists the workspace as the agent user', async () => {
    const runner = new DockerRunnerDouble()
    const provider = await createDockerProviderFactory({
      image: 'runtime:test',
      namespace: 'runtime-test',
      runner,
    })('workspace-sensitive-value')

    await expect(provider.filesystem.list('/workspace')).resolves.toEqual([
      { name: 'notes.md', path: '/workspace/notes.md', type: 'file', size: 5 },
    ])

    const create = runner.calls.find(({ args }) => args[0] === 'run')?.args
    expect(create).toEqual(expect.arrayContaining([
      '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true',
      '--pids-limit', '512', '--memory', '2g', '--cpus', '2', '--user', '10001:10001',
    ]))
    expect(create?.filter((argument) => argument.startsWith('type=volume'))).toHaveLength(2)
    expect(create?.join(' ')).not.toContain('workspace-sensitive-value')
    const list = runner.calls.at(-1)?.args
    expect(list?.slice(0, 4)).toEqual([
      'exec', '--interactive', expect.stringMatching(/^runtime-test-/), 'node',
    ])
  })

  it('starts a compatible stopped container without recreating it', async () => {
    const runner = new DockerRunnerDouble()
    const names = deriveDockerResourceNames('runtime-test', 'workspace-1')
    runner.containerInspection = {
      Image: 'sha256:image',
      State: { Running: false },
      Config: { Labels: {
        'io.mybot.runtime.workspace': names.workspaceHash,
        'io.mybot.runtime.spec': '1',
      } },
    }
    const provider = await createDockerProviderFactory({ image: 'runtime:test', namespace: 'runtime-test', runner })('workspace-1')

    await provider.filesystem.list('/workspace')

    expect(runner.calls.some(({ args }) => args[0] === 'start' && args[1] === names.container)).toBe(true)
    expect(runner.calls.some(({ args }) => args[0] === 'run')).toBe(false)
  })

  it('forwards file and journal content over interactive stdin', async () => {
    const runner = new DockerRunnerDouble()
    const provider = await createDockerProviderFactory({ image: 'runtime:test', namespace: 'runtime-test', runner })('workspace-1')

    await provider.filesystem.write('/workspace/notes.txt', 'workspace content')
    await provider.operationJournal.createExclusive(
      '/var/lib/mybot/runtime/operations/v1/aa/record.json',
      'journal content',
    )

    const writes = runner.calls.filter(({ input }) => input !== undefined)
    expect(writes.map(({ input }) => input)).toEqual(['workspace content', 'journal content'])
    expect(writes.every(({ args }) => args[0] === 'exec' && args[1] === '--interactive')).toBe(true)
    expect(writes[1]?.args).toContain('0:0')
  })

  it('runs isolated browser sessions and returns bounded frames', async () => {
    const runner = new DockerRunnerDouble()
    const provider = await createDockerProviderFactory({ image: 'runtime:test', namespace: 'runtime-test', runner })('workspace-1')

    const opened = await provider.createBrowser('run-1').open('https://example.com')

    expect(opened.json).toEqual({ data: { ok: true } })
    expect(opened.frame).toMatchObject({ base64: Buffer.from('png').toString('base64'), mime_type: 'image/png' })
    const browserCalls = runner.calls.filter(({ args }) => args.includes('agent-browser'))
    expect(browserCalls).toHaveLength(2)
    expect(browserCalls.every(({ args }) => args.includes('--session') && args.includes('--json'))).toBe(true)
  })

  it('refuses to replace a container that is not owned by the requested workspace', async () => {
    const runner = new DockerRunnerDouble()
    runner.containerInspection = {
      Image: 'sha256:image',
      State: { Running: true },
      Config: { Labels: { 'io.mybot.runtime.workspace': 'someone-else' } },
    }
    const provider = await createDockerProviderFactory({ image: 'runtime:test', namespace: 'runtime-test', runner })('workspace-1')

    await expect(provider.filesystem.list('/workspace')).rejects.toMatchObject({ code: 'runtime_unavailable' })
    expect(runner.calls.some(({ args }) => args[0] === 'rm')).toBe(false)
  })
})
