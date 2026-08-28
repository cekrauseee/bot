import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'

export const generateOtpCode = () => randomInt(0, 1_000_000).toString().padStart(6, '0')

export const generateOpaqueToken = (size = 32) => randomBytes(size).toString('base64url')

export const hashOtp = (challengeId: string, code: string, pepper: string) =>
  createHmac('sha256', pepper).update(`${challengeId}:${code}`).digest('hex')

export const keyedIdentifier = (value: string, pepper: string) =>
  createHmac('sha256', pepper).update(value).digest('hex')

export const hashSessionToken = (token: string) => createHash('sha256').update(token).digest()

export const signValue = (value: string, secret: string) =>
  `${value}.${createHmac('sha256', secret).update(value).digest('base64url')}`

export const safeEqual = (first: string, second: string) => {
  const firstBuffer = Buffer.from(first)
  const secondBuffer = Buffer.from(second)
  return firstBuffer.length === secondBuffer.length && timingSafeEqual(firstBuffer, secondBuffer)
}

export const verifySignedValue = (signedValue: string | undefined, secret: string) => {
  if (!signedValue) return undefined
  const separator = signedValue.lastIndexOf('.')
  if (separator <= 0) return undefined
  const value = signedValue.slice(0, separator)
  return safeEqual(signedValue.slice(separator + 1), signValue(value, secret).slice(separator + 1))
    ? value
    : undefined
}
