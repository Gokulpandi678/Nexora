import type { Metadata } from 'next'
import { PageHeader } from '@/components/states'
import PatternsTab from '@/components/PatternsTab'

export const metadata: Metadata = { title: 'Patterns & analytics' }

export default function AnalyticsPage(): React.JSX.Element {
  return (
    <>
      <PageHeader eyebrow="Insights" title="Patterns & analytics" description="Where incidents come from, how fast they're fixed, and what keeps recurring." />
      <PatternsTab />
    </>
  )
}
