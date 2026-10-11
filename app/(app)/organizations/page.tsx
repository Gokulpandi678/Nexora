import type { Metadata } from 'next'
import { PageHeader } from '@/components/states'
import OrganizationsManager from '@/components/organizations/OrganizationsManager'

export const metadata: Metadata = { title: 'Organizations' }

/** Every organization the user belongs to or asked to join; switch, leave, or join more. */
export default function OrganizationsPage(): React.JSX.Element {
  return (
    <>
      <PageHeader
        eyebrow="Account"
        title="Your organizations"
        description="Work across several organizations — your employer, freelance clients, side projects. Incidents never mix between them."
      />
      <OrganizationsManager />
    </>
  )
}
