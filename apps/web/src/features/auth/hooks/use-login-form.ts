import { useCallback, useEffect, useState, type FormEvent } from 'react'

import { AuthApiError, authApi } from '@/features/auth/services/auth-api'

export type LoginStep = 'email' | 'code'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function useLoginForm() {
  const [step, setStep] = useState<LoginStep>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [challengeId, setChallengeId] = useState('')
  const [emailError, setEmailError] = useState('')
  const [codeError, setCodeError] = useState('')
  const [status, setStatus] = useState('')
  const [resendIn, setResendIn] = useState(0)
  const [isRequesting, setIsRequesting] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const normalizedEmail = email.trim().toLowerCase()

  useEffect(() => {
    if (!resendIn) return
    const timer = window.setInterval(() => {
      setResendIn((value) => Math.max(0, value - 1))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [resendIn])

  const applyApiError = useCallback(
    (error: unknown, target: 'email' | 'code') => {
      const apiError = error instanceof AuthApiError ? error : null
      let message = apiError?.message || 'Something went wrong. Try again.'

      if (apiError?.code === 'otp_expired' || apiError?.code === 'challenge_expired') {
        message = 'That code has expired. Request a new code.'
      } else if (apiError?.code === 'otp_invalid' || apiError?.code === 'invalid_code') {
        message = 'That code is incorrect. Try again.'
      } else if (apiError?.code === 'rate_limited') {
        const retryAfterSeconds = apiError.retryAfterSeconds ?? 60
        message = target === 'code'
          ? `Wait ${retryAfterSeconds} seconds before requesting another code.`
          : `Too many attempts. Try again in ${retryAfterSeconds} seconds.`
      } else if (apiError?.code === 'provider_error') {
        message = 'We could not send a code right now. Try again shortly.'
      }

      if (target === 'email') setEmailError(message)
      else setCodeError(message)
    },
    [],
  )

  const updateEmail = useCallback((value: string) => {
    setEmail(value)
    setEmailError('')
  }, [])

  const updateCode = useCallback((value: string) => {
    setCode(value)
    setCodeError('')
    setStatus('')
  }, [])

  const requestCode = useCallback(
    async (target: 'email' | 'code' = 'email') => {
      setIsRequesting(true)
      setEmailError('')
      setCodeError('')

      try {
        const result = await authApi.requestOtp(normalizedEmail)
        setChallengeId(result.challenge_id)
        setResendIn(Math.max(0, result.resend_after_seconds))
        setStatus(`A verification code was sent to ${normalizedEmail}.`)
        setCode('')
        setStep('code')
      } catch (error) {
        applyApiError(error, target)
      } finally {
        setIsRequesting(false)
      }
    },
    [applyApiError, normalizedEmail],
  )

  const handleEmailSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (!EMAIL_PATTERN.test(normalizedEmail)) {
        setEmailError('Enter a valid email, such as name@example.com.')
        return
      }
      void requestCode()
    },
    [normalizedEmail, requestCode],
  )

  const handleCodeSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (code.length !== 6) {
        setCodeError('Enter the 6-digit code sent to your email.')
        return
      }

      setIsVerifying(true)
      setCodeError('')
      try {
        await authApi.verifyOtp(challengeId, code)
        setStatus("Code verified. You're signed in.")
        window.location.assign('/')
      } catch (error) {
        applyApiError(error, 'code')
      } finally {
        setIsVerifying(false)
      }
    },
    [applyApiError, challengeId, code],
  )

  const changeEmail = useCallback(() => {
    setCode('')
    setCodeError('')
    setStatus('')
    setStep('email')
  }, [])

  const resendCode = useCallback(() => {
    if (!resendIn && !isRequesting) void requestCode('code')
  }, [isRequesting, requestCode, resendIn])

  return {
    changeEmail,
    code,
    codeError,
    email,
    emailError,
    handleCodeSubmit,
    handleEmailSubmit,
    isRequesting,
    isVerifying,
    normalizedEmail,
    resendCode,
    resendIn,
    status,
    step,
    updateCode,
    updateEmail,
  }
}
