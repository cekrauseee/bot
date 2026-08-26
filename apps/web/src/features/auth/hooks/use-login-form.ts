import { useCallback, useState, type FormEvent } from 'react'

export type LoginStep = 'email' | 'code'

const MOCK_CODE = '123456'
const EXISTING_EMAILS = new Set(['alex@example.com'])
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function useLoginForm() {
  const [step, setStep] = useState<LoginStep>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [emailError, setEmailError] = useState('')
  const [codeError, setCodeError] = useState('')
  const [status, setStatus] = useState('')
  const [isVerified, setIsVerified] = useState(false)
  const normalizedEmail = email.trim().toLowerCase()
  const isExistingUser = EXISTING_EMAILS.has(normalizedEmail)

  const updateEmail = useCallback((value: string) => {
    setEmail(value)
    setEmailError('')
  }, [])

  const updateCode = useCallback((value: string) => {
    setCode(value)
    setCodeError('')
    setStatus('')
    setIsVerified(false)
  }, [])

  const handleEmailSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()

      if (!EMAIL_PATTERN.test(normalizedEmail)) {
        setEmailError('Enter a valid email, such as name@example.com.')
        return
      }

      setStatus('')
      setIsVerified(false)
      setStep('code')
    },
    [normalizedEmail],
  )

  const handleCodeSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()

      if (code.length !== 6) {
        setCodeError('Enter the 6-digit code sent to your email.')
        return
      }

      if (code !== MOCK_CODE) {
        setCodeError('That code is incorrect. Try again.')
        return
      }

      setCodeError('')
      setIsVerified(true)
      setStatus(
        isExistingUser
          ? "Code verified. You're signed in."
          : 'Code verified. Your account has been created.',
      )
    },
    [code, isExistingUser],
  )

  const changeEmail = useCallback(() => {
    setCode('')
    setCodeError('')
    setStatus('')
    setIsVerified(false)
    setStep('email')
  }, [])

  const resendCode = useCallback(() => {
    setCodeError('')
    setStatus(`A new code was sent to ${normalizedEmail}.`)
  }, [normalizedEmail])

  return {
    changeEmail,
    code,
    codeError,
    email,
    emailError,
    handleCodeSubmit,
    handleEmailSubmit,
    isExistingUser,
    isVerified,
    normalizedEmail,
    resendCode,
    status,
    step,
    updateCode,
    updateEmail,
  }
}
