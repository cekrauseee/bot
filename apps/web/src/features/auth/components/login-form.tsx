import { ArrowLeft } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/motion/button/base'
import { Input } from '@/components/motion/input'
import { OTPInput } from '@/components/motion/otp-input'
import { useLoginForm } from '@/features/auth/hooks/use-login-form'
import { authApi } from '@/features/auth/services/auth-api'
import { cn } from '@/lib/utils'

export function LoginForm() {
  const {
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
  } = useLoginForm()
  const [callbackError] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('error') === 'google'
      ? 'Google sign-in could not be completed. Try again or use your email.'
      : ''
  })
  const emailInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('error') !== 'google') return
    window.history.replaceState({}, '', `${window.location.pathname}${window.location.hash}`)
  }, [])

  useEffect(() => {
    if (step === 'email') emailInputRef.current?.focus()
  }, [step])

  useEffect(() => {
    if (emailError) emailInputRef.current?.focus()
  }, [emailError])

  useEffect(() => {
    if (codeError) {
      document.querySelector<HTMLInputElement>('[aria-label="Verification code"]')?.focus()
    }
  }, [codeError])

  if (step === 'code') {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1 text-start">
          <h1 className="text-balance text-2xl font-semibold leading-tight tracking-tight">
            Confirm your email
          </h1>
          <p className="text-pretty text-sm leading-normal text-muted-foreground">
            Enter the code sent to {normalizedEmail}.
          </p>
        </div>

        <form
          className="flex flex-col gap-3"
          onSubmit={handleCodeSubmit}
          noValidate
        >
          <OTPInput
            aria-label="Verification code"
            autoFocus
            disabled={isVerifying}
            errorMessage={codeError || undefined}
            label="Verification code"
            onChange={updateCode}
            status={codeError ? 'error' : 'idle'}
            value={code}
          />

          <Button
            className="min-h-11 w-full sm:min-h-10"
            disabled={isVerifying}
            pressScale={0.96}
            size="md"
            type="submit"
          >
            {isVerifying ? 'Verifying…' : 'Verify code'}
          </Button>
        </form>

        <div className="flex min-h-10 items-center justify-between gap-3">
          <button
            className="-ml-2 flex min-h-10 items-center gap-1.5 rounded-full px-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            onClick={changeEmail}
            type="button"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Change email
          </button>

          <button
            className="min-h-10 rounded-sm text-sm font-medium text-foreground underline-offset-4 hover:underline"
            disabled={Boolean(resendIn) || isRequesting}
            onClick={resendCode}
            type="button"
          >
            {resendIn ? `Resend code in ${resendIn}s` : isRequesting ? 'Sending…' : 'Resend code'}
          </button>
        </div>

        <span className="sr-only" aria-live="polite" role="status">{status}</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1 text-start">
        <h1 className="text-balance text-2xl font-semibold leading-tight tracking-tight">
          Welcome back
        </h1>
        <p className="text-pretty text-sm leading-normal text-muted-foreground">
          Sign in to continue.
        </p>
      </div>

      <form
        className="flex flex-col gap-3"
        onSubmit={handleEmailSubmit}
        noValidate
      >
        <p
          aria-live="polite"
          className={cn('text-sm', callbackError && 'text-destructive')}
          role="status"
        >
          {callbackError}
        </p>
        <Button
          className="min-h-11 w-full sm:min-h-10"
          pressScale={0.96}
          size="md"
          type="button"
          variant="outline"
          onClick={() => { window.location.href = authApi.googleStartUrl() }}
        >
          Continue with Google
        </Button>

        <div className="flex items-center gap-2.5" aria-hidden="true">
          <span className="h-px flex-1 bg-border" />
          <span className="text-xs font-medium text-muted-foreground">or</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        <Input
          ref={emailInputRef}
          autoComplete="email"
          error={emailError || undefined}
          inputMode="email"
          label="Email"
          name="email"
          onChange={updateEmail}
          placeholder="name@example.com"
          spellCheck={false}
          type="email"
          value={email}
        />

        <Button
          className="min-h-11 w-full sm:min-h-10"
          disabled={isRequesting}
          pressScale={0.96}
          size="md"
          type="submit"
        >
          {isRequesting ? 'Sending…' : 'Continue'}
        </Button>
      </form>
    </div>
  )
}
