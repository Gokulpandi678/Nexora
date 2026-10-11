// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import {
  EfficiencyBadge, SeverityBadge, SolutionStatusBadge, StatusBadge, SystemTag
} from '@/components/incident-badges'

afterEach(cleanup)

describe('SeverityBadge', () => {
  it('shows the severity as text plus an icon, never color alone', () => {
    const { container } = render(<SeverityBadge severity="P1" />)
    const badge = screen.getByText('P1')
    expect(badge).toHaveAttribute('title', 'P1 · Critical')
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('shows the long label when asked', () => {
    render(<SeverityBadge severity="P4" long />)
    expect(screen.getByText('P4 · Low')).toBeInTheDocument()
  })

  it.each(['P1', 'P2', 'P3', 'P4'])('gives %s a distinct text label and icon', severity => {
    const { container } = render(<SeverityBadge severity={severity} long />)
    expect(container.textContent).toMatch(new RegExp(`^${severity} · \\w+$`))
    expect(container.querySelectorAll('svg')).toHaveLength(1)
  })

  it('passes unknown values through', () => {
    render(<SeverityBadge severity="P9" long />)
    expect(screen.getByText('P9')).toBeInTheDocument()
  })
})

describe('StatusBadge', () => {
  it.each([
    ['OPEN', 'Open'],
    ['INVESTIGATING', 'Investigating'],
    ['RESOLVED', 'Resolved'],
    ['CLOSED', 'Closed']
  ])('labels %s as "%s" with an icon', (status, label) => {
    const { container } = render(<StatusBadge status={status} />)
    expect(screen.getByText(label)).toBeInTheDocument()
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })
})

describe('SolutionStatusBadge', () => {
  it('labels each status', () => {
    render(
      <>
        <SolutionStatusBadge status="VERIFIED" />
        <SolutionStatusBadge status="DEPRECATED" />
        <SolutionStatusBadge status="UNVERIFIED" />
      </>
    )
    expect(screen.getByText('Verified')).toBeInTheDocument()
    expect(screen.getByText('Deprecated')).toBeInTheDocument()
    expect(screen.getByText('Unverified')).toBeInTheDocument()
  })
})

describe('EfficiencyBadge and SystemTag', () => {
  it('use human labels', () => {
    render(
      <>
        <EfficiencyBadge efficiency="HIGH" />
        <EfficiencyBadge efficiency="LOW" />
        <SystemTag system="Database" highlight />
      </>
    )
    expect(screen.getByText('Permanent fix')).toBeInTheDocument()
    expect(screen.getByText('Workaround')).toBeInTheDocument()
    expect(screen.getByText('Database')).toHaveAttribute('title', 'Shared with your report')
  })
})
