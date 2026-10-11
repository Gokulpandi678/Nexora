'use client'

import { useState } from 'react'
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts'
import { BarChart3, Table2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CHART } from '@/lib/design-tokens'
import { useDocumentTheme } from '@/hooks/useDocumentTheme'
import { cn } from '@/lib/utils'

/** Chart colors resolved from the live design tokens, so SVG follows both the theme toggle and the UI style. */
export type ChartTheme = Record<keyof (typeof CHART)['light'], string>

export function useChartTheme(): ChartTheme {
  const { dark, token } = useDocumentTheme()
  const fallback = dark ? CHART.dark : CHART.light
  if (typeof window === 'undefined') return fallback
  return {
    series: token('primary'),
    grid: token('border'),
    axis: token('subtle'),
    text: token('muted-foreground'),
    surface: token('surface')
  }
}

interface TableSpec {
  columns: string[]
  rows: (string | number)[][]
}

/** Card wrapper that can swap any chart for an accessible data table. */
export function ChartCard({ title, description, table, children, className }: {
  title: string
  description?: string
  table: TableSpec
  children: React.ReactNode
  className?: string
}): React.JSX.Element {
  const [asTable, setAsTable] = useState(false)
  return (
    <Card className={className}>
      <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription className="mt-1">{description}</CardDescription>}
        </div>
        <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={() => setAsTable(t => !t)}
          aria-label={asTable ? `Show ${title} as chart` : `Show ${title} as table`} aria-pressed={asTable}>
          {asTable ? <BarChart3 /> : <Table2 />}
        </Button>
      </CardHeader>
      <CardContent>
        {asTable ? <DataTable {...table} /> : table.rows.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">No data yet.</p> : children}
      </CardContent>
    </Card>
  )
}

export function DataTable({ columns, rows }: TableSpec): React.JSX.Element {
  return (
    <div className="max-h-72 overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-surface text-left text-xs text-muted-foreground">
          <tr>{columns.map((c, i) => <th key={c} scope="col" className={cn('py-1.5 pr-3 font-medium', i > 0 && 'text-right')}>{c}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r, ri) => (
            <tr key={ri}>{r.map((v, i) => <td key={i} className={cn('py-1.5 pr-3', i > 0 && 'text-right tabular-nums')}>{v}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TooltipBox({ title, lines }: { title: string; lines: string[] }): React.JSX.Element {
  return (
    <div className="ui-pop rounded-md border border-border bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold">{title}</p>
      {lines.map(l => <p key={l} className="text-muted-foreground">{l}</p>)}
    </div>
  )
}

interface Slice {
  label: string
  value: number
  color: string
}

/** Donut with a labelled legend, so identity never depends on color alone. */
export function DonutChart({ data, unit }: { data: Slice[]; unit: string }): React.JSX.Element {
  const theme = useChartTheme()
  const total = data.reduce((s, d) => s + d.value, 0)
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative h-48 w-48 shrink-0">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="label" innerRadius="62%" outerRadius="100%" paddingAngle={1}
              stroke={theme.surface} strokeWidth={2} isAnimationActive={false}>
              {data.map(d => <Cell key={d.label} fill={d.color} />)}
            </Pie>
            <Tooltip content={({ active, payload }) => {
              const p = payload?.[0]
              if (!active || !p) return null
              const v = Number(p.value)
              return <TooltipBox title={String(p.name)} lines={[`${v} ${unit}${v === 1 ? '' : 's'} · ${total ? Math.round((v / total) * 100) : 0}%`]} />
            }} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold tabular-nums">{total}</span>
          <span className="text-xs text-muted-foreground">total</span>
        </div>
      </div>
      <ul className="flex w-full flex-col gap-2 text-sm">
        {data.map(d => (
          <li key={d.label} className="flex items-center gap-2">
            <span className="size-3 shrink-0 rounded-sm" style={{ background: d.color }} aria-hidden="true" />
            <span className="flex-1">{d.label}</span>
            <span className="font-semibold tabular-nums">{d.value}</span>
            <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">{total ? Math.round((d.value / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Single-series horizontal bars, one brand hue, value printed at the end of each bar. */
export function HBarChart({ data, unit, height }: { data: { label: string; value: number }[]; unit: string; height?: number }): React.JSX.Element {
  const theme = useChartTheme()
  return (
    <div style={{ height: height ?? Math.max(120, data.length * 32 + 20) }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ left: 4, right: 36, top: 0, bottom: 0 }} barCategoryGap={6}>
          <CartesianGrid horizontal={false} stroke={theme.grid} />
          <XAxis type="number" allowDecimals={false} tick={{ fill: theme.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="label" width={96} tick={{ fill: theme.text, fontSize: 12 }} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: theme.grid, opacity: 0.5 }} content={({ active, payload }) => {
            const p = payload?.[0]
            if (!active || !p) return null
            const v = Number(p.value)
            return <TooltipBox title={String(p.payload.label)} lines={[`${v} ${unit}${v === 1 ? '' : 's'}`]} />
          }} />
          <Bar dataKey="value" fill={theme.series} radius={[0, 4, 4, 0]} isAnimationActive={false}
            label={{ position: 'right', fill: theme.text, fontSize: 11 }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

const shortDay = (iso: string): string =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })

/** Single-series daily line; days without data are gaps, not zeros. */
export function TrendLine({ data, valueLabel, format }: {
  data: { day: string; value: number | null }[]
  valueLabel: string
  format: (v: number) => string
}): React.JSX.Element {
  const theme = useChartTheme()
  return (
    <div className="h-56">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={theme.grid} />
          <XAxis dataKey="day" tickFormatter={shortDay} tick={{ fill: theme.axis, fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={24} />
          <YAxis tickFormatter={v => format(Number(v))} tick={{ fill: theme.axis, fontSize: 11 }} axisLine={false} tickLine={false} width={56} />
          <Tooltip cursor={{ stroke: theme.axis, strokeDasharray: '3 3' }} content={({ active, payload, label }) => {
            const p = payload?.[0]
            if (!active || !p) return null
            return <TooltipBox title={shortDay(String(label))} lines={[`${valueLabel}: ${p.value === null || p.value === undefined ? 'no data' : format(Number(p.value))}`]} />
          }} />
          <Line type="monotone" dataKey="value" stroke={theme.series} strokeWidth={2.5} dot={{ r: 3, fill: theme.series, strokeWidth: 0 }}
            activeDot={{ r: 5, stroke: theme.surface, strokeWidth: 2 }} connectNulls={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Daily counts as columns. */
export function DailyColumns({ data, unit }: { data: { day: string; value: number }[]; unit: string }): React.JSX.Element {
  const theme = useChartTheme()
  return (
    <div className="h-56">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ left: 0, right: 12, top: 8, bottom: 0 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} stroke={theme.grid} />
          <XAxis dataKey="day" tickFormatter={shortDay} tick={{ fill: theme.axis, fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={24} />
          <YAxis allowDecimals={false} tick={{ fill: theme.axis, fontSize: 11 }} axisLine={false} tickLine={false} width={32} />
          <Tooltip cursor={{ fill: theme.grid, opacity: 0.5 }} content={({ active, payload, label }) => {
            const p = payload?.[0]
            if (!active || !p) return null
            const v = Number(p.value)
            return <TooltipBox title={shortDay(String(label))} lines={[`${v} ${unit}${v === 1 ? '' : 's'}`]} />
          }} />
          <Bar dataKey="value" fill={theme.series} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Sequential single-hue heatmap in the style's primary color; every cell also prints its count. */
export function Heatmap({ rows, columns, value }: { rows: string[]; columns: string[]; value: (row: string, col: string) => number }): React.JSX.Element {
  const max = Math.max(1, ...rows.flatMap(r => columns.map(c => value(r, c))))
  const STEPS = 7
  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-1 text-xs">
        <thead>
          <tr>
            <th scope="col" className="sr-only">Department</th>
            {columns.map(c => <th key={c} scope="col" className="px-1 pb-1 font-medium text-muted-foreground">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r}>
              <th scope="row" className="whitespace-nowrap pr-2 text-left font-medium">{r}</th>
              {columns.map(c => {
                const v = value(r, c)
                const step = v === 0 ? -1 : Math.min(STEPS - 1, Math.floor((v / max) * (STEPS - 1)))
                const alpha = 0.14 + (step / (STEPS - 1)) * 0.86
                return (
                  <td key={c} title={`${r} × ${c}: ${v}`}
                    className={cn('h-9 min-w-12 rounded-md text-center font-medium tabular-nums transition-transform hover:scale-110',
                      step < 0 ? 'bg-muted text-subtle' : step >= 4 ? 'text-primary-foreground' : 'text-foreground')}
                    style={step < 0 ? undefined : { background: `rgb(var(--primary) / ${alpha.toFixed(2)})` }}>
                    {v || '·'}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
