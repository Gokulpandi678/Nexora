// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import KpiCard from '@/components/KpiCard'

afterEach(cleanup)

describe('KpiCard', () => {
  it('renders label, value and sub text', () => {
    render(<KpiCard label="Open incidents" value={12} sub="3 are P1" />)
    expect(screen.getByText('Open incidents')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('3 are P1')).toBeInTheDocument()
  })

  it('announces an increase as "up" and marks it good when up is good', () => {
    render(<KpiCard label="Resolved" value={10} delta={{ value: 4, label: 'vs last month', goodWhen: 'up' }} />)
    const delta = screen.getByText((_, el) => el?.tagName === 'SPAN' && el.textContent === '4 up')
    expect(delta).toHaveClass('text-success-foreground')
    expect(screen.getByText('vs last month')).toBeInTheDocument()
  })

  it('announces a decrease as "down" with the absolute value', () => {
    render(<KpiCard label="MTTR" value="1h" delta={{ value: -7, label: 'vs last week', goodWhen: 'down' }} />)
    const delta = screen.getByText((_, el) => el?.tagName === 'SPAN' && el.textContent === '7 down')
    expect(delta).toHaveClass('text-success-foreground')
  })

  it('marks a change in the wrong direction as bad', () => {
    render(<KpiCard label="Incidents" value={20} delta={{ value: 5, label: 'vs last month', goodWhen: 'down' }} />)
    const delta = screen.getByText((_, el) => el?.tagName === 'SPAN' && el.textContent === '5 up')
    expect(delta).toHaveClass('text-danger-foreground')
  })

  it('shows no direction for zero change but keeps the label', () => {
    render(<KpiCard label="Incidents" value={20} delta={{ value: 0, label: 'same as last month', goodWhen: 'down' }} />)
    expect(screen.queryByText(/\b(up|down)$/)).toBeNull()
    expect(screen.getByText('same as last month')).toBeInTheDocument()
  })
})
