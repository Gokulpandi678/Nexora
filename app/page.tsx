import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import LandingPage from '@/components/landing/LandingPage'
import { getSession, homePath } from '@/lib/session'

export const metadata: Metadata = {
  title: { absolute: 'Nexora — never solve the same incident twice' },
  description:
    'Nexora matches every new incident to the ones your team already solved — by meaning, not just keywords — and puts the verified fix in front of you.'
}

/** Public landing page. Signed-in people go straight to where they work. */
export default async function Home(): Promise<React.JSX.Element> {
  const session = await getSession()
  if (session) redirect(homePath(session))
  return <LandingPage />
}
