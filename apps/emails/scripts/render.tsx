import { mkdir, writeFile } from 'node:fs/promises'
import { render } from '@react-email/render'
import LoginOtpEmail, { PreviewProps } from '../emails/login-otp'

const html = await render(<LoginOtpEmail {...PreviewProps} />)
await mkdir('out', { recursive: true })
await writeFile('out/login-otp.html', html)
console.log('Rendered out/login-otp.html')
