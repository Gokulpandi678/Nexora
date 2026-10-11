import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import AuthShell from '@/components/auth/AuthShell'
import OnboardingFlow from '@/components/auth/OnboardingFlow'
import { homePath, requireSession } from '@/lib/session'

export const metadata: Metadata = { title: 'Get started' }

/** New users: fill in their details, pick an organization and wait for its admin to approve them. */
export default async function OnboardingPage(): Promise<React.JSX.Element> {
  const session = await requireSession()
  if (homePath(session) !== '/onboarding') redirect(homePath(session))

  return (
    <AuthShell
      wide
      eyebrow="Get started"
      title={session.user.name ? `Welcome, ${session.user.name.split(' ')[0]}` : 'Welcome to Nexora'}
      description="Three quick steps and you're in."
      signedInAs={session.user.email}
    >
      <OnboardingFlow session={session} />
    </AuthShell>
  )
}
