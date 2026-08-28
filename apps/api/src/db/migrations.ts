import { createHash } from 'node:crypto'
import { access, readFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'

export type MigrationManifestEntry = {
  idx: number
  tag: string
  hash: string
  when?: number
}

export type MigrationRecord = {
  hash: string
  createdAt?: string | number | bigint
}

export type MigrationHistoryResult = {
  ok: boolean
  reason?: 'pending' | 'mismatch' | 'out-of-order' | 'unexpected'
  message?: string
}

type Journal = {
  entries?: Array<{ idx?: number; tag?: string; when?: number }>
}

const asFolderUrl = (folder: URL | string) => folder instanceof URL
  ? new URL(folder.toString().endsWith('/') ? folder.toString() : `${folder.toString()}/`)
  : pathToFileURL(folder.endsWith('/') ? folder : `${folder}/`)

export async function readMigrationManifest(folder: URL | string): Promise<MigrationManifestEntry[]> {
  const folderUrl = asFolderUrl(folder)
  const journal = JSON.parse(await readFile(new URL('meta/_journal.json', folderUrl), 'utf8')) as Journal
  const entries = [...(journal.entries ?? [])].sort((left, right) => (left.idx ?? -1) - (right.idx ?? -1))
  if (!entries.length) throw new Error('local migration journal has no entries')

  const seenTags = new Set<string>()
  const seenIndexes = new Set<number>()
  const manifest: MigrationManifestEntry[] = []
  for (const entry of entries) {
    const idx = entry.idx
    const tag = entry.tag
    if (!Number.isInteger(idx) || !tag || seenTags.has(tag) || seenIndexes.has(idx as number)) {
      throw new Error('local migration journal contains duplicate or invalid entries')
    }
    const validIdx = idx as number
    seenTags.add(tag)
    seenIndexes.add(validIdx)
    const sql = await readFile(new URL(`${tag}.sql`, folderUrl), 'utf8')
    manifest.push({
      idx: validIdx,
      tag,
      hash: createHash('sha256').update(sql).digest('hex'),
      when: entry.when,
    })
  }
  return manifest
}

/** Find packaged migrations first, with a source-tree fallback for tsx/dev. */
export async function resolveMigrationsFolder(): Promise<URL> {
  const candidates = [
    new URL('../drizzle/', import.meta.url),
    new URL('../../drizzle/', import.meta.url),
  ]
  for (const candidate of candidates) {
    try {
      await access(new URL('meta/_journal.json', candidate))
      return candidate
    } catch {
      // Try the next location.
    }
  }
  throw new Error('packaged or source migration assets are missing')
}

export function compareMigrationHistory(
  expected: readonly MigrationManifestEntry[],
  applied: readonly MigrationRecord[],
): MigrationHistoryResult {
  if (applied.length > expected.length) {
    return { ok: false, reason: 'unexpected', message: 'database contains migrations not present locally' }
  }
  const expectedByHash = new Map(expected.map((entry) => [entry.hash, entry]))
  for (let index = 0; index < applied.length; index += 1) {
    const actual = applied[index]
    const wanted = expected[index]
    if (actual.hash === wanted.hash) continue
    const known = expectedByHash.get(actual.hash)
    if (known) {
      return {
        ok: false,
        reason: 'out-of-order',
        message: `database migration ${known.tag} is recorded at position ${index + 1}, expected position ${known.idx + 1}`,
      }
    }
    return {
      ok: false,
      reason: 'mismatch',
      message: `database migration at position ${index + 1} does not match local migration history`,
    }
  }
  if (applied.length < expected.length) {
    const pending = expected.slice(applied.length).map((entry) => entry.tag).join(', ')
    return { ok: false, reason: 'pending', message: `pending database migrations: ${pending}` }
  }
  return { ok: true }
}

export const migrationFolderPath = (folder: URL) => fileURLToPath(folder)
