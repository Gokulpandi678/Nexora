import { AlertCircle, Inbox } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export function ErrorNotice({ message, onRetry, className }: { message: string; onRetry?: () => void; className?: string }): React.JSX.Element {
  return (
    <div role="alert" className={cn('flex items-center justify-between gap-3 rounded-md border border-danger/40 bg-danger-soft px-4 py-3', className)}>
      <p className="flex items-center gap-2 text-sm text-danger-foreground">
        <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
        {message}
      </p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

export function EmptyState({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border bg-surface/60 px-6 py-12 text-center">
      <span className="mb-1 flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-info-foreground">
        <Inbox className="size-6" aria-hidden="true" />
      </span>
      <p className="font-display text-base font-semibold tracking-tight">{title}</p>
      {children && <div className="max-w-[48ch] text-sm text-muted-foreground">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function LoadingRows({ count = 3, className }: { count?: number; className?: string }): React.JSX.Element {
  return (
    <div className={cn('flex flex-col gap-3', className)} role="status" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-20 w-full rounded-lg" />
      ))}
    </div>
  )
}

export function PageHeader({ title, description, actions, eyebrow }: {
  title: string
  description?: string
  actions?: React.ReactNode
  eyebrow?: string
}): React.JSX.Element {
  return (
    <div className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="animate-rise">
        {eyebrow && <p className="eyebrow mb-1.5 text-info-foreground">{eyebrow}</p>}
        <h1 className="font-display-tight text-3xl font-bold">{title}</h1>
        {description && <p className="mt-1.5 max-w-[65ch] text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function FieldError({ id, message }: { id: string; message?: string }): React.JSX.Element | null {
  if (!message) return null
  return (
    <p id={id} className="mt-1.5 text-xs text-danger-foreground">
      {message}
    </p>
  )
}
