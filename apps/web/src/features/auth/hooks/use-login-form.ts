import { useCallback, useEffect, useState, type FormEvent } from 'react'

import { AuthApiError, authApi } from '@/features/auth/services/auth-api'

export type LoginStep = 'email' | 'code'
export type AuthActionStatus = 'idle' | 'loading' | 'success' | 'error'

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
  const [requestStatus, setRequestStatus] = useState<AuthActionStatus>('idle')
  const [resendStatus, setResendStatus] = useState<AuthActionStatus>('idle')
  const [verifyStatus, setVerifyStatus] = useState<AuthActionStatus>('idle')
  const normalizedEmail = email.trim().toLowerCase()
  const isRequesting = requestStatus === 'loading' || resendStatus === 'loading'
  const isVerifying = verifyStatus === 'loading'

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
    setRequestStatus('idle')
  }, [])

  const updateCode = useCallback((value: string) => {
    setCode(value)
    setCodeError('')
    setStatus('')
    setVerifyStatus('idle')
  }, [])

  const requestCode = useCallback(
    async (target: 'email' | 'code' = 'email') => {
      if (target === 'code') setResendStatus('loading')
      else setRequestStatus('loading')
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
        if (target === 'code') setResendStatus('error')
        else setRequestStatus('error')
      } finally {
        if (target === 'code') {
          setResendStatus((current) => current === 'loading' ? 'idle' : current)
        } else {
          setRequestStatus((current) => current === 'loading' ? 'idle' : current)
        }
      }
    },
    [applyApiError, normalizedEmail],
  )

  const handleEmailSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (!EMAIL_PATTERN.test(normalizedEmail)) {
        setEmailError('Enter a valid email, such as name@example.com.')
        setRequestStatus('error')
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
        setVerifyStatus('error')
        return
      }

      setVerifyStatus('loading')
      setCodeError('')
      try {
        await authApi.verifyOtp(challengeId, code)
        setVerifyStatus('success')
        setStatus("Code verified. You're signed in.")
        window.location.assign('/')
      } catch (error) {
        applyApiError(error, 'code')
        setVerifyStatus('error')
      }
    },
    [applyApiError, challengeId, code],
  )

  const changeEmail = useCallback(() => {
    setCode('')
    setCodeError('')
    setStatus('')
    setVerifyStatus('idle')
    setResendStatus('idle')
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
    requestStatus,
    resendCode,
    resendIn,
    resendStatus,
    status,
    step,
    verifyStatus,
    updateCode,
    updateEmail,
  }
}
