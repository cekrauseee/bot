import { readExternalAuthenticationStatus } from './lib/environment.mjs'

const status = await readExternalAuthenticationStatus()

if (status.configured) {
  console.log('Google and Resend environment variables are configured.')
} else {
  console.error(`External authentication still needs: ${status.missing.join(', ')}`)
  process.exitCode = 1
}
