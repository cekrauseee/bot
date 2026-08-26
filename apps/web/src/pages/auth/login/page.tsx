import { ThemeToggle } from '@/components/motion/theme-toggle'
import { LoginForm } from '@/features/auth/components/login-form'

export function LoginPage() {
  return (
    <main className="relative flex min-h-svh flex-col">
      <header className="mx-auto flex w-full max-w-4xl justify-end px-5 py-4 sm:px-6">
        <ThemeToggle
          className="relative size-9 rounded-full border border-border bg-background text-foreground shadow-sm transition-colors after:absolute after:left-1/2 after:top-1/2 after:size-11 after:-translate-x-1/2 after:-translate-y-1/2 hover:bg-muted"
          iconClassName="size-3.5"
          start="top-right"
          variant="circle"
        />
      </header>

      <section className="mx-auto flex w-full max-w-xl flex-1 items-center px-5 py-8 sm:px-6">
        <div className="mx-auto flex w-full max-w-xs flex-col gap-5">
          <div className="flex flex-col gap-1 text-start">
            <span className="text-sm font-semibold tracking-tight">myBOT</span>
            <h1 className="text-balance text-2xl font-semibold leading-tight tracking-tight">
              Welcome back
            </h1>
            <p className="text-pretty text-sm leading-normal text-muted-foreground">
              Sign in to continue.
            </p>
          </div>

          <LoginForm />

          <p className="text-start text-xs leading-relaxed text-muted-foreground">
            By continuing, you agree to the{' '}
            <a
              className="rounded-sm underline underline-offset-4 hover:text-foreground"
              href="#terms"
            >
              Terms
            </a>{' '}
            and{' '}
            <a
              className="rounded-sm underline underline-offset-4 hover:text-foreground"
              href="#privacy"
            >
              Privacy Policy
            </a>
            .
          </p>
        </div>
      </section>
    </main>
  )
}
