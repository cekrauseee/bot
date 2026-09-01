import { useEffect, useRef, useState, type FormEvent } from "react"
import { useNavigate } from "react-router-dom"

import { buttonVariants, Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp"
import { Spinner } from "@/components/ui/spinner"
import { authApi, AuthApiError, type OtpChallenge } from "@/features/auth/api"
import { cn } from "@/lib/utils"

type PendingAction = "request" | "verify" | "resend" | null

function requestErrorMessage(error: unknown) {
  if (error instanceof AuthApiError) {
    if (error.code === "rate_limited") {
      return "Please wait a moment before requesting another code."
    }
    if (error.code === "email_delivery_unavailable") {
      return "We couldn’t send the code. Please try again."
    }
  }
  return "We couldn’t send the code. Check your connection and try again."
}

function verificationErrorMessage(error: unknown) {
  if (error instanceof AuthApiError) {
    if (error.code === "invalid_code") {
      return "That code is incorrect or has expired. Request a new code and try again."
    }
    if (error.code === "code_attempts_exhausted") {
      return "Too many attempts. Request a new code to continue."
    }
    if (error.code === "rate_limited") {
      return "Too many attempts. Please wait a moment and try again."
    }
  }
  return "We couldn’t verify the code. Check your connection and try again."
}

export function SignInCard({ googleError = false }: { googleError?: boolean }) {
  const navigate = useNavigate()
  const emailInputRef = useRef<HTMLInputElement>(null)
  const otpInputRef = useRef<HTMLInputElement>(null)
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null)
  const [remainingSeconds, setRemainingSeconds] = useState(0)
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)
  const [emailError, setEmailError] = useState("")
  const [codeError, setCodeError] = useState("")
  const [resendError, setResendError] = useState("")

  useEffect(() => {
    if (remainingSeconds <= 0) return
    const timer = window.setInterval(() => {
      setRemainingSeconds((seconds) => Math.max(0, seconds - 1))
    }, 1_000)
    return () => window.clearInterval(timer)
  }, [remainingSeconds])

  const requestCode = async (action: "request" | "resend") => {
    setPendingAction(action)
    setEmailError("")
    setCodeError("")
    setResendError("")
    try {
      const nextChallenge = await authApi.requestOtp(email.trim())
      setChallenge(nextChallenge)
      setCode(nextChallenge.development_code ?? "")
      setRemainingSeconds(nextChallenge.resend_after_seconds)
    } catch (error) {
      const message = requestErrorMessage(error)
      if (action === "request") {
        setEmailError(message)
        emailInputRef.current?.focus()
      } else {
        setResendError(message)
      }
    } finally {
      setPendingAction(null)
    }
  }

  const handleEmailSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const input = emailInputRef.current
    if (!email.trim()) {
      setEmailError("Enter your email to continue.")
      input?.focus()
      return
    }
    if (input?.validity.typeMismatch) {
      setEmailError("That email doesn’t look right. Try name@example.com.")
      input?.focus()
      return
    }
    await requestCode("request")
  }

  const handleEmailChange = (value: string) => {
    setEmail(value)
    if (emailError) setEmailError("")
  }

  const handleCodeSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!challenge || !/^\d{6}$/.test(code)) {
      setCodeError("Enter the 6-digit code from your email.")
      otpInputRef.current?.focus()
      return
    }

    setPendingAction("verify")
    setCodeError("")
    try {
      await authApi.verifyOtp(challenge.challenge_id, code)
      navigate("/", { replace: true })
    } catch (error) {
      setCodeError(verificationErrorMessage(error))
      otpInputRef.current?.focus()
    } finally {
      setPendingAction(null)
    }
  }

  const handleCodeChange = (value: string) => {
    setCode(value)
    if (codeError) setCodeError("")
  }

  const resetEmail = () => {
    setChallenge(null)
    setCode("")
    setCodeError("")
    setResendError("")
    window.setTimeout(() => emailInputRef.current?.focus())
  }

  const canResend = remainingSeconds === 0 && pendingAction === null

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>
          <h1>Sign in to myBot</h1>
        </CardTitle>
        <CardDescription>
          {challenge
            ? `Enter the code sent to ${email.trim()}.`
            : "Use Google or your email address."}
        </CardDescription>
      </CardHeader>

      <CardContent>
        {challenge ? (
          <form
            onSubmit={handleCodeSubmit}
            noValidate
            aria-busy={pendingAction === "verify"}
          >
            <FieldGroup className="gap-3">
              <Field data-invalid={Boolean(codeError)}>
                <FieldLabel htmlFor="sign-code">Verification code</FieldLabel>
                <InputOTP
                  ref={otpInputRef}
                  id="sign-code"
                  name="code"
                  value={code}
                  onChange={handleCodeChange}
                  maxLength={6}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  disabled={pendingAction !== null}
                  aria-invalid={Boolean(codeError)}
                  aria-describedby={
                    codeError ? "sign-code-error" : "sign-code-description"
                  }
                >
                  <InputOTPGroup>
                    {Array.from({ length: 6 }, (_, index) => (
                      <InputOTPSlot key={index} index={index} />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
                {codeError ? (
                  <FieldError id="sign-code-error">{codeError}</FieldError>
                ) : (
                  <FieldDescription id="sign-code-description">
                    The code expires in{" "}
                    {Math.ceil(challenge.expires_in_seconds / 60)} minutes.
                  </FieldDescription>
                )}
              </Field>
              <Button type="submit" disabled={pendingAction !== null}>
                {pendingAction === "verify" && (
                  <Spinner data-icon="inline-start" />
                )}
                Continue
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!canResend}
                onClick={() => void requestCode("resend")}
              >
                {pendingAction === "resend" && (
                  <Spinner data-icon="inline-start" />
                )}
                {remainingSeconds > 0
                  ? `Send again in ${remainingSeconds}s`
                  : "Send a new code"}
              </Button>
              {resendError && <FieldError>{resendError}</FieldError>}
            </FieldGroup>
          </form>
        ) : (
          <FieldGroup>
            <a
              href={authApi.googleStartUrl}
              className={cn(buttonVariants({ variant: "outline" }), "w-full")}
            >
              Continue with Google
            </a>
            <FieldSeparator>or</FieldSeparator>
            <form
              onSubmit={handleEmailSubmit}
              noValidate
              aria-busy={pendingAction === "request"}
            >
              <FieldGroup>
                <Field data-invalid={Boolean(emailError)}>
                  <FieldLabel htmlFor="sign-email">Email</FieldLabel>
                  <Input
                    ref={emailInputRef}
                    id="sign-email"
                    name="email"
                    type="email"
                    value={email}
                    onChange={(event) => handleEmailChange(event.target.value)}
                    placeholder="name@example.com"
                    autoComplete="email"
                    autoFocus
                    spellCheck={false}
                    required
                    disabled={pendingAction !== null}
                    aria-invalid={Boolean(emailError)}
                    aria-describedby={
                      emailError ? "sign-email-error" : undefined
                    }
                  />
                  {emailError && (
                    <FieldError id="sign-email-error">{emailError}</FieldError>
                  )}
                </Field>
                <Button type="submit" disabled={pendingAction !== null}>
                  {pendingAction === "request" && (
                    <Spinner data-icon="inline-start" />
                  )}
                  Continue with email
                </Button>
              </FieldGroup>
            </form>
            {googleError && (
              <FieldError>
                Google sign-in didn’t work. Please try again.
              </FieldError>
            )}
          </FieldGroup>
        )}
      </CardContent>

      {challenge && (
        <CardFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={resetEmail}
            disabled={pendingAction !== null}
          >
            Use another email
          </Button>
        </CardFooter>
      )}
    </Card>
  )
}
