import { Eye, EyeOff } from 'lucide-react'

import { Button } from '@/components/motion/button/base'
import { Input } from '@/components/motion/input'
import { useLoginForm } from '@/features/auth/hooks/use-login-form'

export function LoginForm() {
  const {
    email,
    handleSubmit,
    isPasswordVisible,
    password,
    setEmail,
    setPassword,
    togglePasswordVisibility,
  } = useLoginForm()

  return (
    <form className="flex flex-col gap-3" onSubmit={handleSubmit} noValidate>
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

      <div className="flex flex-col gap-2.5">
        <Input
          autoComplete="username"
          inputMode="email"
          label="Email"
          name="email"
          onChange={setEmail}
          placeholder="name@example.com"
          spellCheck={false}
          type="email"
          value={email}
        />

        <div className="flex flex-col gap-1">
          <Input
            autoComplete="current-password"
            label="Password"
            name="password"
            onChange={setPassword}
            rightIcon={
              <button
                aria-label={
                  isPasswordVisible ? 'Hide password' : 'Show password'
                }
                className="rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground"
                onClick={togglePasswordVisibility}
                type="button"
              >
                {isPasswordVisible ? <EyeOff /> : <Eye />}
              </button>
            }
            type={isPasswordVisible ? 'text' : 'password'}
            value={password}
          />

          <a
            className="w-fit self-start rounded-sm text-sm font-medium text-foreground underline-offset-4 hover:underline"
            href="#forgot-password"
          >
            Forgot password?
          </a>
        </div>
      </div>

      <Button
        className="min-h-11 w-full sm:min-h-10"
        pressScale={0.96}
        size="md"
        type="submit"
      >
        Sign in
      </Button>

      <p className="text-start text-sm text-muted-foreground">
        New to myBOT?{' '}
        <a
          className="rounded-sm font-medium text-foreground underline-offset-4 hover:underline"
          href="#create-account"
        >
          Create account
        </a>
      </p>
    </form>
  )
}
