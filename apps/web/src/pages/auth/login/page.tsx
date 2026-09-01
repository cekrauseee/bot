import { useEffect } from 'react'

import { LoginForm } from '@/features/auth/components/login-form'
import { PageEntrance, PageEntranceItem } from '@/components/page-entrance'

export function LoginPage() {
  useEffect(() => {
    document.title = 'Sign in · myBot'
  }, [])

  return (
    <PageEntrance>
    <main className="relative flex min-h-svh flex-col">
      <section className="mx-auto flex w-full max-w-xl flex-1 items-center px-5 py-8 sm:px-6">
        <div className="mx-auto flex w-full max-w-xs flex-col gap-5">
          <PageEntranceItem index={0} count={3}>
            <span className="text-sm font-semibold tracking-tight">myBot</span>
          </PageEntranceItem>

          <PageEntranceItem index={1} count={3}>
            <LoginForm />
          </PageEntranceItem>

          <PageEntranceItem index={2} count={3}>
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
          </PageEntranceItem>
        </div>
      </section>
    </main>
    </PageEntrance>
  )
}
