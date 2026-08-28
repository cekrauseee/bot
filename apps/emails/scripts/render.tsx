import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { render, toPlainText } from '@react-email/render'

import LoginOtpEmail, { loginOtpSubject } from '../emails/login-otp'

const OTP_CODE_TOKEN = '__MYBOT_OTP_CODE__'
const EXPIRATION_MINUTES_TOKEN = '__MYBOT_EXPIRATION_MINUTES__'
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const templatesDirectory = path.resolve(
  scriptDirectory,
  '../../api/src/modules/auth/email/templates',
)
const component = (
  <LoginOtpEmail
    otpCode={OTP_CODE_TOKEN}
    expirationMinutes={EXPIRATION_MINUTES_TOKEN}
  />
)
const html = await render(component)
const outputs = new Map([
  ['login-otp.html', html],
  ['login-otp.txt', toPlainText(html)],
  ['login-otp.json', `${JSON.stringify({ subject: loginOtpSubject }, null, 2)}\n`],
])

async function checkOutputs() {
  const stale = []

  for (const [name, expected] of outputs) {
    try {
      const current = await readFile(path.join(templatesDirectory, name), 'utf8')
      if (current !== expected) stale.push(name)
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') {
        throw error
      }
      stale.push(name)
    }
  }

  if (stale.length > 0) {
    throw new Error(
      `Generated email templates are stale: ${stale.join(', ')}. Run npm run emails:render.`,
    )
  }
}

async function writeOutputs() {
  await mkdir(templatesDirectory, { recursive: true })
  await Promise.all(
    [...outputs].map(([name, contents]) =>
      writeFile(path.join(templatesDirectory, name), contents),
    ),
  )
  console.log(`Rendered ${outputs.size} local email template artifacts.`)
}

if (process.argv.includes('--check')) await checkOutputs()
else await writeOutputs()
