import type { Metadata } from 'next'
import { PageHeader } from '@/components/states'
import ProjectsManager from '@/components/admin/ProjectsManager'
import { activeMemberOptions } from '@/lib/projects'
import { requireOrgAdmin } from '@/lib/session'

export const metadata: Metadata = { title: 'Projects & SLAs' }
export const dynamic = 'force-dynamic'

/** Organization admins define projects, their uptime targets and their SLA policies. */
export default async function ProjectsPage(): Promise<React.JSX.Element> {
  const session = await requireOrgAdmin()
  // Only active members can lead a project; the picker offers exactly those
  const members = await activeMemberOptions(session.membership!.organization.id)
  return (
    <>
      <PageHeader
        eyebrow={session.membership!.organization.name}
        title="Projects & SLAs"
        description="The products and services incidents affect, with their uptime targets and response and resolve deadlines."
      />
      <ProjectsManager members={members} />
    </>
  )
}
