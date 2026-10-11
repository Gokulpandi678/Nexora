import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { Card } from '@/components/ui/card'
import Sparkline from '@/components/Sparkline'
import { cn } from '@/lib/utils'

export type KpiTone = 'primary' | 'danger' | 'warning' | 'success' | 'secondary'

const TONE: Record<KpiTone, { chip: string; spark: string }> = {
  primary: { chip: 'bg-primary-soft text-info-foreground', spark: 'text-primary' },
  secondary: { chip: 'bg-secondary-soft text-secondary', spark: 'text-secondary' },
  danger: { chip: 'bg-danger-soft text-danger-foreground', spark: 'text-danger' },
  warning: { chip: 'bg-warning-soft text-warning-foreground', spark: 'text-warning' },
  success: { chip: 'bg-success-soft text-success-foreground', spark: 'text-success' }
}

interface Props {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  /** Change vs. previous period; `goodWhen` says which direction is good */
  delta?: { value: number; label: string; goodWhen: 'up' | 'down' }
  Icon?: React.ComponentType<{ className?: string }>
  tone?: KpiTone
  /** Optional recent series drawn as a sparkline under the value */
  spark?: (number | null)[]
  className?: string
}

export default function KpiCard({ label, value, sub, delta, Icon, tone = 'primary', spark, className }: Props): React.JSX.Element {
  const good = delta && (delta.value === 0 ? null : (delta.value > 0) === (delta.goodWhen === 'up'))
  const t = TONE[tone]
  return (
    <Card className={cn('ui-card-interactive group relative flex flex-col gap-1 overflow-hidden p-5', className)}>
      <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
        <span className="ui-label-mono text-[13px] font-medium">{label}</span>
        {Icon && (
          <span className={cn('flex size-8 items-center justify-center rounded-lg transition-transform group-hover:scale-110', t.chip)}>
            <Icon className="size-4" />
          </span>
        )}
      </div>
      <p className="font-display text-3xl font-bold tabular-nums tracking-tight">{value}</p>
      <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
        {delta && delta.value !== 0 && (
          <span className={cn('inline-flex items-center font-medium', good ? 'text-success-foreground' : 'text-danger-foreground')}>
            {delta.value > 0 ? <ArrowUpRight className="size-3.5" aria-hidden="true" /> : <ArrowDownRight className="size-3.5" aria-hidden="true" />}
            {Math.abs(delta.value)}
            <span className="sr-only">{delta.value > 0 ? ' up' : ' down'}</span>
          </span>
        )}
        {delta && <span>{delta.label}</span>}
        {sub && <span>{sub}</span>}
      </div>
      {spark && <Sparkline values={spark} className={cn('mt-2', t.spark)} />}
    </Card>
  )
}
