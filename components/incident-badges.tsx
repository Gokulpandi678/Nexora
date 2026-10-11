import { AlertOctagon, AlertTriangle, ArrowDown, CheckCircle2, Circle, CircleDot, Lock, Minus, ShieldCheck } from 'lucide-react'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import {
  EFFICIENCY_LABEL, SEVERITY_LABEL, STATUS_LABEL, isOneOf, EFFICIENCIES, SEVERITIES, STATUSES
} from '@/lib/constants'

const SEVERITY_STYLE: Record<string, { variant: BadgeProps['variant']; Icon: typeof Circle }> = {
  P1: { variant: 'danger', Icon: AlertOctagon },
  P2: { variant: 'warning', Icon: AlertTriangle },
  P3: { variant: 'default', Icon: Minus },
  P4: { variant: 'neutral', Icon: ArrowDown }
}

/** Severity always shows its label next to the color, so it never relies on color alone. */
export function SeverityBadge({ severity, long = false }: { severity: string; long?: boolean }): React.JSX.Element {
  const style = SEVERITY_STYLE[severity] ?? { variant: 'neutral' as const, Icon: Circle }
  const label = isOneOf(SEVERITIES, severity) ? SEVERITY_LABEL[severity] : severity
  return (
    <Badge variant={style.variant} title={label}>
      <style.Icon aria-hidden="true" />
      {long ? label : severity}
    </Badge>
  )
}

const STATUS_STYLE: Record<string, { variant: BadgeProps['variant']; Icon: typeof Circle }> = {
  OPEN: { variant: 'default', Icon: Circle },
  INVESTIGATING: { variant: 'warning', Icon: CircleDot },
  RESOLVED: { variant: 'success', Icon: CheckCircle2 },
  CLOSED: { variant: 'neutral', Icon: Lock }
}

export function StatusBadge({ status }: { status: string }): React.JSX.Element {
  const style = STATUS_STYLE[status] ?? { variant: 'neutral' as const, Icon: Circle }
  return (
    <Badge variant={style.variant}>
      <style.Icon aria-hidden="true" />
      {isOneOf(STATUSES, status) ? STATUS_LABEL[status] : status}
    </Badge>
  )
}

export function SolutionStatusBadge({ status }: { status: string }): React.JSX.Element {
  if (status === 'VERIFIED') {
    return (
      <Badge variant="success">
        <ShieldCheck aria-hidden="true" /> Verified
      </Badge>
    )
  }
  if (status === 'DEPRECATED') return <Badge variant="outline">Deprecated</Badge>
  return <Badge variant="neutral">Unverified</Badge>
}

export function EfficiencyBadge({ efficiency }: { efficiency: string }): React.JSX.Element {
  const variant: BadgeProps['variant'] = efficiency === 'HIGH' ? 'success' : efficiency === 'MEDIUM' ? 'default' : 'warning'
  return <Badge variant={variant}>{isOneOf(EFFICIENCIES, efficiency) ? EFFICIENCY_LABEL[efficiency] : efficiency}</Badge>
}

export function SystemTag({ system, highlight = false }: { system: string; highlight?: boolean }): React.JSX.Element {
  return (
    <Badge variant={highlight ? 'secondary' : 'outline'} title={highlight ? 'Shared with your report' : undefined}>
      {system}
    </Badge>
  )
}
