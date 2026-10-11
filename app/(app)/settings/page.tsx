import type { Metadata } from 'next'
import { PageHeader } from '@/components/states'
import SettingsForm from '@/components/SettingsForm'

export const metadata: Metadata = { title: 'Settings' }

export default function SettingsPage(): React.JSX.Element {
  return (
    <>
      <PageHeader eyebrow="Preferences" title="Settings" description="Your profile, and how the app looks and feels." />
      <SettingsForm />
    </>
  )
}
