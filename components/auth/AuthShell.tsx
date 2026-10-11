import Link from 'next/link'
import { LogOut } from 'lucide-react'
import Logo from '@/components/Logo'
import { Button } from '@/components/ui/button'
import { signOutAction } from '@/lib/actions'
import { cn } from '@/lib/utils'

/** Full-page frame for sign-in, invitation and onboarding screens (outside the app shell). */
export default function AuthShell({ title, description, eyebrow, signedInAs, wide = false, children }: {
  title: string
  description?: React.ReactNode
  eyebrow?: string
  /** Shows "Signed in as … · Sign out" in the top bar */
  signedInAs?: string
  wide?: boolean
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="relative flex min-h-screen flex-col">
      <div className="app-backdrop" aria-hidden="true" />
      <header className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/" aria-label="Nexora home">
          <Logo sub={null} />
        </Link>
        {signedInAs && (
          <form action={signOutAction} className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
            <span className="hidden truncate sm:inline">Signed in as {signedInAs}</span>
            <Button type="submit" variant="ghost" size="sm">
              <LogOut aria-hidden="true" /> Sign out
            </Button>
          </form>
        )}
      </header>
      {/* Wide pages use the screen's width so forms fit on one screen instead of scrolling */}
      <main id="main" className={cn('mx-auto flex w-full flex-1 flex-col px-4 sm:px-6', wide ? 'max-w-6xl pb-10 pt-2 sm:pt-4' : 'max-w-md pb-16 pt-6 sm:pt-12')}>
        <div className={cn('animate-rise', wide ? 'mb-4' : 'mb-6')}>
          {eyebrow && <p className="eyebrow mb-1.5 text-info-foreground">{eyebrow}</p>}
          <h1 className={cn('font-display-tight font-bold', wide ? 'text-2xl sm:text-3xl' : 'text-3xl')}>{title}</h1>
          {description && <div className="mt-1.5 text-sm text-muted-foreground">{description}</div>}
        </div>
        {children}
      </main>
    </div>
  )
}
