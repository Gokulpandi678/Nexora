import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { LogIn, UserPlus } from 'lucide-react'
import AuthShell from '@/components/auth/AuthShell'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { getSession, homePath } from '@/lib/session'

export const metadata: Metadata = { title: 'Sign in' }

export default async function LoginPage(): Promise<React.JSX.Element> {
  const session = await getSession()
  if (session) redirect(homePath(session))

  return (
    <AuthShell
      eyebrow="Welcome"
      title="Sign in to Nexora"
      description="Learn from every incident your team has already solved."
    >
      <Card>
        <CardContent className="flex flex-col gap-3 p-5">
          <Button asChild size="lg">
            <a href="/auth/sign-in"><LogIn aria-hidden="true" /> Sign in</a>
          </Button>
          <Button asChild size="lg" variant="outline">
            <a href="/auth/sign-up"><UserPlus aria-hidden="true" /> Create an account</a>
          </Button>
          <p className="pt-2 text-xs leading-relaxed text-muted-foreground">
            New here? Create an account, add your details and ask to join your organization. An admin of that
            organization approves your request. Setting up a new organization? Use the invitation link you were emailed.
          </p>
        </CardContent>
      </Card>
    </AuthShell>
  )
}
