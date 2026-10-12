import type { Metadata } from 'next'
import { PageHeader } from '@/components/states'
import SlaDashboard from '@/components/SlaDashboard'

export const metadata: Metadata = { title: 'SLA & uptime' }

export default function SlaPage(): React.JSX.Element {
  return (
    <>
      <PageHeader eyebrow="Insights" title="SLA & uptime" description="Are we keeping our promises? Response and resolve deadlines, availability and the cost of downtime, per project." />
      <SlaDashboard />
    </>
  )
}
