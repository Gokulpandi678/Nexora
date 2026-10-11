import AppHeader from '@/components/AppHeader'
import SessionProvider from '@/components/SessionProvider'
import Sidebar from '@/components/Sidebar'
import { requireMember } from '@/lib/session'

/** The incident workspace: approved organization members only (admins and users share it). */
export default async function AppLayout({ children }: { children: React.ReactNode }): Promise<React.JSX.Element> {
  const session = await requireMember()
  return (
    <SessionProvider session={session}>
      <div className="relative flex min-h-screen">
        <div className="app-backdrop" aria-hidden="true" />
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:shadow-lg"
        >
          Skip to content
        </a>
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <AppHeader />
          <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            {children}
          </main>
        </div>
      </div>
    </SessionProvider>
  )
}
