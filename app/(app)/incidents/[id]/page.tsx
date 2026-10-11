import type { Metadata } from 'next'
import IncidentDetail from '@/components/IncidentDetail'

export const metadata: Metadata = { title: 'Incident' }

export default async function IncidentPage({ params }: { params: Promise<{ id: string }> }): Promise<React.JSX.Element> {
  const { id } = await params
  return <IncidentDetail id={id} />
}
