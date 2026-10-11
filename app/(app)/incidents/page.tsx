import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LoadingRows, PageHeader } from '@/components/states'
import IncidentList from '@/components/IncidentList'

export const metadata: Metadata = { title: 'Browse incidents' }

export default function IncidentsPage(): React.JSX.Element {
  return (
    <>
      <PageHeader
        eyebrow="Library"
        title="Incidents"
        description="Search, filter and triage every reported incident. Switch between table, cards and board."
        actions={<Button asChild><Link href="/incidents/new"><Plus aria-hidden="true" /> Report incident</Link></Button>}
      />
      <Suspense fallback={<LoadingRows count={6} />}>
        <IncidentList />
      </Suspense>
    </>
  )
}
