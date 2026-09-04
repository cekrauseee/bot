import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import test from 'node:test'

import { projectRoot } from '../lib/project.mjs'

const webSource = `${projectRoot}/apps/web/src`

test('canonical web app owns the route tree', async () => {
  const router = await readFile(`${webSource}/routes/router.tsx`, 'utf8')
  assert.match(router, /Route path="sign"/)
  await access(`${projectRoot}/apps/web/package.json`)
  await access(`${projectRoot}/apps/web/src`)
})

test('sign-in uses semantic controls and preserves desktop transaction context', async () => {
  const page = await readFile(`${webSource}/routes/sign/page.tsx`, 'utf8')
  const card = await readFile(`${webSource}/features/auth/components/sign-in-card.tsx`, 'utf8')
  const handoff = await readFile(`${webSource}/features/auth/components/desktop-browser-handoff.tsx`, 'utf8')
  const callback = await readFile(`${webSource}/features/auth/desktop-callback.ts`, 'utf8')
  assert.match(page, /desktop_transaction/)
  assert.match(page, /DesktopBrowserHandoff/)
  assert.match(handoff, /completeDesktop/)
  assert.match(callback, /mybot:/)
  assert.match(handoff, /Open Bot/)
  assert.match(card, /desktopTransaction/)
  assert.match(card, /aria-invalid/)
  assert.match(card, /window\.location\.assign/)
  assert.doesNotMatch(card, /desktop_transaction: desktopTransaction/)
})

test('desktop sign-in exposes only one browser handoff action', async () => {
  const source = await readFile(`${webSource}/features/auth/components/desktop-sign-in.tsx`, 'utf8')
  assert.match(source, /Continue in browser/)
  assert.doesNotMatch(source, /client_secret|sessionToken|Authorization/)
})
