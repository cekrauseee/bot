import { ArrowLeft } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'

import { Input } from '@/components/motion/input'
import { OTPInput } from '@/components/motion/otp-input'
import { StatefulButton, type ButtonState } from '@/components/motion/button/stateful'
import { useLoginForm } from '@/features/auth/hooks/use-login-form'
import { authApi } from '@/features/auth/services/auth-api'
import { SPRING_SWAP } from '@/lib/ease'
import { cn } from '@/lib/utils'
import { AuthStepTransition } from './auth-step-transition'

function CountdownValue({ value }: { value: number }) {
  const reduceMotion = useReducedMotion()

  return (
    <span className="inline-flex min-w-[2ch] justify-center overflow-hidden tabular-nums">
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={value}
          initial={reduceMotion ? false : { opacity: 0, y: '100%', filter: 'blur(4px)' }}
          animate={{ opacity: 1, y: '0%', filter: 'blur(0px)' }}
          exit={reduceMotion ? undefined : { opacity: 0, y: '-100%', filter: 'blur(4px)' }}
          transition={reduceMotion ? { duration: 0 } : SPRING_SWAP}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}

export function LoginForm() {
  const {
    changeEmail,
    code,
    codeError,
    email,
    emailError,
    handleCodeSubmit,
    handleEmailSubmit,
    isVerifying,
    normalizedEmail,
    requestStatus,
    resendCode,
    resendIn,
    resendStatus,
    status,
    step,
    updateCode,
    updateEmail,
    verifyStatus,
  } = useLoginForm()
  const [callbackError] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('error') === 'google'
      ? 'Google sign-in could not be completed. Try again or use your email.'
      : ''
  })
  const [googleStatus, setGoogleStatus] = useState<ButtonState>(() =>
    callbackError ? 'error' : 'idle',
  )
  const emailInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('error') !== 'google') return
    window.history.replaceState({}, '', `${window.location.pathname}${window.location.hash}`)
  }, [])

  useEffect(() => {
    if (step === 'email') emailInputRef.current?.focus({ preventScroll: true })
  }, [step])

  useEffect(() => {
    if (emailError) emailInputRef.current?.focus()
  }, [emailError])

  useEffect(() => {
    if (codeError) {
      document.querySelector<HTMLInputElement>('[aria-label="Verification code"]')?.focus()
    }
  }, [codeError])

  const content = step === 'code' ? (
      <div key="code-step" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1 text-start">
          <h1 className="text-balance text-xl font-semibold leading-tight tracking-tight">
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

          <StatefulButton
            className="min-h-11 w-full sm:min-h-10"
            pressScale={0.96}
            size="md"
            state={verifyStatus}
            errorText="Try again"
            loadingText="Verifying…"
            successText="Verified"
            type="submit"
          >
            Verify code
          </StatefulButton>
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

          <StatefulButton
            className="min-h-10 rounded-sm px-2 text-sm font-medium text-foreground underline-offset-4 hover:bg-transparent hover:underline disabled:opacity-100 disabled:text-muted-foreground"
            disabled={Boolean(resendIn)}
            onClick={resendCode}
            size="sm"
            state={resendStatus}
            type="button"
            errorText="Try again"
            loadingText="Sending…"
            variant="ghost"
          >
            <span className="inline-flex items-baseline">
              <span>Resend code</span>
              {resendIn ? (
                <>
                  <span className="whitespace-pre"> in </span>
                  <CountdownValue value={resendIn} />
                  <span>s</span>
                </>
              ) : null}
            </span>
          </StatefulButton>
        </div>

        <span className="sr-only" aria-live="polite" role="status">{status}</span>
      </div>
    ) : (
    <div key="email-step" className="flex flex-col gap-5">
      <div className="flex flex-col gap-1 text-start">
        <h1 className="text-balance text-xl font-semibold leading-tight tracking-tight">
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
        <StatefulButton
          className="min-h-11 w-full sm:min-h-10"
          pressScale={0.96}
          size="md"
          state={googleStatus}
          errorText="Try again"
          loadingText="Opening Google…"
          successText="Signed in"
          type="button"
          onClick={() => {
            setGoogleStatus('loading')
            window.location.href = authApi.googleStartUrl()
          }}
          variant="outline"
        >
          Continue with Google
        </StatefulButton>

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

        <StatefulButton
          className="min-h-11 w-full sm:min-h-10"
          pressScale={0.96}
          size="md"
          state={requestStatus}
          errorText="Try again"
          loadingText="Sending…"
          successText="Sent"
          type="submit"
        >
          Continue
        </StatefulButton>
      </form>
    </div>
  )

  return <AuthStepTransition step={step}>{content}</AuthStepTransition>
}
