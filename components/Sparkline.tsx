import { useId } from 'react'
import { cn } from '@/lib/utils'

/** Tiny decorative trend line; the exact numbers live in the card text. Nulls are skipped. */
export default function Sparkline({ values, className }: { values: (number | null)[]; className?: string }): React.JSX.Element | null {
  const id = useId()
  const points = values.map((v, i) => ({ i, v })).filter((p): p is { i: number; v: number } => p.v !== null)
  if (points.length < 2) return null

  const w = 120
  const h = 36
  const max = Math.max(...points.map(p => p.v))
  const min = Math.min(...points.map(p => p.v))
  const span = max - min || 1
  const x = (i: number): number => (i / Math.max(1, values.length - 1)) * w
  const y = (v: number): number => h - 3 - ((v - min) / span) * (h - 6)

  const line = points.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')
  const first = points[0]
  const last = points[points.length - 1]
  const area = first && last ? `${line} L${x(last.i).toFixed(1)},${h} L${x(first.i).toFixed(1)},${h} Z` : ''

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={cn('h-9 w-full overflow-visible', className)} aria-hidden="true">
      <defs>
        <linearGradient id={`spark-${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#spark-${id})`} />
      <path d={line} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      {last && <circle cx={x(last.i)} cy={y(last.v)} r="2.5" fill="currentColor" />}
    </svg>
  )
}
