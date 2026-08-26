import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import type { CSSProperties } from 'react'

export const loginOtpAlias = 'mybot-login-otp'

export type LoginOtpEmailProps = {
  otpCode?: string
  expirationMinutes?: number | string
}

const colors = {
  background: '#f7f7f7',
  card: '#ffffff',
  foreground: '#252525',
  muted: '#6d6d6d',
  border: '#e5e5e5',
  codeBackground: '#f0f0f0',
}

const fontFamily = 'Geist, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'

const textStyle: CSSProperties = {
  color: colors.foreground,
  fontFamily,
  fontSize: '15px',
  lineHeight: '24px',
  margin: '0',
}

export default function LoginOtpEmail({
  otpCode = '{{{OTP_CODE}}}',
  expirationMinutes = '{{{EXPIRATION_MINUTES}}}',
}: LoginOtpEmailProps) {
  const expiry = String(expirationMinutes)

  return (
    <Html>
      <Head />
      <Preview>Your myBot sign-in code is {otpCode}. It expires in {expiry} minutes.</Preview>
      <Body style={{ backgroundColor: colors.background, margin: '0', padding: '32px 16px' }}>
        <Container
          style={{
            backgroundColor: colors.card,
            border: `1px solid ${colors.border}`,
            borderRadius: '10px',
            margin: '0 auto',
            maxWidth: '480px',
            padding: '32px',
          }}
        >
          <Text style={{ ...textStyle, fontSize: '14px', fontWeight: 600, letterSpacing: '-0.01em' }}>
            myBot
          </Text>
          <Heading as="h1" style={{ ...textStyle, fontSize: '24px', fontWeight: 600, letterSpacing: '-0.03em', lineHeight: '32px', margin: '28px 0 0' }}>
            Your sign-in code
          </Heading>
          <Text style={{ ...textStyle, color: colors.muted, marginTop: '8px' }}>
            Enter this code to continue to myBot.
          </Text>
          <Section
            aria-label="Your six-digit sign-in code"
            style={{ backgroundColor: colors.codeBackground, borderRadius: '8px', margin: '24px 0', padding: '18px 16px', textAlign: 'center' }}
          >
            <Text style={{ ...textStyle, fontSize: '32px', fontWeight: 600, letterSpacing: '0.22em', lineHeight: '40px', margin: '0 0 0 0.22em', textAlign: 'center' }}>
              {otpCode}
            </Text>
          </Section>
          <Text style={{ ...textStyle, color: colors.muted, fontSize: '13px', lineHeight: '20px' }}>
            This code expires in {expiry} minutes.
          </Text>
          <Hr style={{ borderColor: colors.border, margin: '28px 0 20px' }} />
          <Text style={{ ...textStyle, color: colors.muted, fontSize: '13px', lineHeight: '20px' }}>
            If you did not request this, you can ignore this email.
          </Text>
        </Container>
        <Text style={{ ...textStyle, color: colors.muted, fontSize: '12px', lineHeight: '18px', margin: '20px auto 0', maxWidth: '480px', textAlign: 'center' }}>
          This is an automated message from myBot.
        </Text>
      </Body>
    </Html>
  )
}

export const PreviewProps: LoginOtpEmailProps = {
  otpCode: '482913',
  expirationMinutes: 10,
}
