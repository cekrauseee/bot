import { describe, expect, it } from 'vitest'
import {
  generateOpaqueToken,
  generateOtpCode,
  hashOtp,
  hashSessionToken,
  signValue,
  verifySignedValue,
} from '../src/security.js'

describe('security primitives', () => {
  it('generates varied six-digit codes', () => {
    const codes = new Set(Array.from({ length: 100 }, generateOtpCode))
    expect([...codes].every((code) => /^\d{6}$/.test(code))).toBe(true)
    expect(codes.size).toBeGreaterThan(90)
  })

  it('binds OTP hashes to the challenge context', () => {
    expect(hashOtp('challenge-a', '123456', 'pepper'))
      .not.toBe(hashOtp('challenge-b', '123456', 'pepper'))
  })

  it('stores opaque session tokens as SHA-256 bytes', () => {
    expect(hashSessionToken(generateOpaqueToken())).toHaveLength(32)
  })

  it('rejects tampered OAuth state cookie values', () => {
    const signed = signValue('state', 'session-secret')

    expect(verifySignedValue(signed, 'session-secret')).toBe('state')
    expect(verifySignedValue(`${signed}tampered`, 'session-secret')).toBeUndefined()
  })
})
