import { cn } from '@/lib/utils'

export const PRODUCT_NAME = 'Nexora'
export const PRODUCT_TAGLINE = 'Incident intelligence'

/** The Nexora mark: a node at the center of converging orbits, i.e. every incident connected to its history. */
export function LogoMark({ className }: { className?: string }): React.JSX.Element {
  return (
    <span className={cn('brand-mark flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-white shadow-md', className)}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="size-[58%]" aria-hidden="true">
        <path d="M4 18V6l16 12V6" />
        <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      </svg>
    </span>
  )
}

/** Mark + wordmark. `sub` replaces the tagline (e.g. with the current organization). */
export default function Logo({ sub, hideText, className }: { sub?: string | null; hideText?: string; className?: string }): React.JSX.Element {
  return (
    <span className={cn('flex min-w-0 items-center gap-2.5', className)}>
      <LogoMark />
      <span className={cn('min-w-0 leading-tight', hideText)}>
        <span className="block truncate font-display text-[15px] font-bold tracking-tight">{PRODUCT_NAME}</span>
        {sub !== null && <span className="block truncate text-[11px] text-muted-foreground">{sub ?? PRODUCT_TAGLINE}</span>}
      </span>
    </span>
  )
}
