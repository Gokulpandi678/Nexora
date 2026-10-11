import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Overview from '@/components/Overview'

// Old ?tab= links (from the previous single-page version) keep working
export const metadata: Metadata = { title: 'Dashboard' }

const LEGACY_TABS: Record<string, string> = { report: '/incidents/new', view: '/incidents', patterns: '/analytics' }

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }): Promise<React.JSX.Element> {
  const { tab } = await searchParams
  const target = tab ? LEGACY_TABS[tab] : undefined
  if (target) redirect(target)
  return <Overview />
}
