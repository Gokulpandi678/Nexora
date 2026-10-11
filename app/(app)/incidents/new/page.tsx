import type { Metadata } from 'next'
import { PageHeader } from '@/components/states'
import IncidentForm from '@/components/IncidentForm'

export const metadata: Metadata = { title: 'Report incident' }

export default function NewIncidentPage(): React.JSX.Element {
  return (
    <>
      <PageHeader eyebrow="New report" title="Report an incident" description="Describe what you see. We'll check it against past incidents first." />
      <IncidentForm />
    </>
  )
}
