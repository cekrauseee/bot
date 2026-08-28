import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const migration = new URL('../drizzle/0000_compatibility.sql', import.meta.url)

describe('compatibility migration', () => {
  it('is versioned and preserves named auth constraints on fresh schemas', async () => {
    const sql = await readFile(migration, 'utf8')
    expect(sql).toContain('CONSTRAINT uq_users_email UNIQUE')
    expect(sql).toContain('CONSTRAINT ck_users_email_lowercase CHECK (email = lower(email))')
    expect(sql).toContain('CONSTRAINT uq_oauth_identities_provider_subject UNIQUE')
    expect(sql).toContain('CONSTRAINT uq_sessions_token_hash UNIQUE')
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS')
    expect(sql).toContain('--> statement-breakpoint')
  })

  it('contains compatibility repair paths without DROP statements', async () => {
    const sql = await readFile(migration, 'utf8')
    expect(sql.toLowerCase()).not.toContain('drop table')
    expect(sql).toContain('ALTER TABLE users ALTER COLUMN id SET DEFAULT')
    expect(sql).toContain('RENAME CONSTRAINT')
  })
})
