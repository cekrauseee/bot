import { ArrowLeft } from 'lucide-react'
import { useEffect, useRef } from 'react'

import { Button } from '@/components/motion/button/base'
import { Input } from '@/components/motion/input'
import { OTPInput } from '@/components/motion/otp-input'
import { useLoginForm } from '@/features/auth/hooks/use-login-form'

export function LoginForm() {
  const {
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
  } = useLoginForm()
  const emailInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (step === 'email') emailInputRef.current?.focus()
  }, [step])

  useEffect(() => {
    if (emailError) emailInputRef.current?.focus()
  }, [emailError])

  if (step === 'code') {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1 text-start">
          <h1 className="text-balance text-2xl font-semibold leading-tight tracking-tight">
            {isExistingUser ? 'Welcome back' : 'Create account'}
          </h1>
          <p className="text-pretty text-sm leading-normal text-muted-foreground">
            {isExistingUser
              ? `Enter the code sent to ${normalizedEmail}.`
              : `Confirm ${normalizedEmail} with the code we sent.`}
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
            disabled={isVerified}
            errorMessage={codeError || undefined}
            label="Verification code"
            onChange={updateCode}
            status={isVerified ? 'success' : codeError ? 'error' : 'idle'}
            successMessage={isVerified ? status : undefined}
            value={code}
          />

          <Button
            className="min-h-11 w-full sm:min-h-10"
            disabled={isVerified}
            pressScale={0.96}
            size="md"
            type="submit"
          >
            {isVerified
              ? isExistingUser
                ? 'Signed in'
                : 'Account created'
              : isExistingUser
                ? 'Sign in'
                : 'Create account'}
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

          {!isVerified ? (
            <button
              className="min-h-10 rounded-sm text-sm font-medium text-foreground underline-offset-4 hover:underline"
              onClick={resendCode}
              type="button"
            >
              {status ? 'Code sent' : 'Resend code'}
            </button>
          ) : null}
        </div>

        {!isVerified ? (
          <span className="sr-only" aria-live="polite" role="status">
            {status}
          </span>
        ) : null}
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
        <Button
          className="min-h-11 w-full sm:min-h-10"
          pressScale={0.96}
          size="md"
          type="button"
          variant="outline"
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
          pressScale={0.96}
          size="md"
          type="submit"
        >
          Continue
        </Button>
      </form>
    </div>
  )
}
