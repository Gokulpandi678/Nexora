// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import IncidentForm from '@/components/IncidentForm'
import { useIdentityStore } from '@/lib/store'

const TITLE = 'Checkout API returns 504 when the database connection pool is exhausted'
const DESCRIPTION =
  'The checkout service started timing out for most requests. The Postgres connection pool is pinned at its maximum while query latency stays low.'
const SYMPTOMS = 'HTTP 504 from /api/checkout after 30s. Logs: TimeoutError connection pool exhausted (max 20).'

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  localStorage.clear()
  useIdentityStore.setState({
    currentUser: { name: 'Rita Reporter', email: 'rita@example.com', department: 'SRE' },
    userRole: 'REPORTER'
  })
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const submitButton = (): HTMLElement => screen.getByRole('button', { name: /report & check for matches/i })
const type = (label: RegExp, value: string): void => {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

function fillValidForm(): void {
  type(/^title$/i, TITLE)
  type(/^description$/i, DESCRIPTION)
  type(/^symptoms$/i, SYMPTOMS)
  fireEvent.click(screen.getByRole('button', { name: 'Database' }))
}

describe('IncidentForm', () => {
  it('prefills reporter fields from the profile', () => {
    render(<IncidentForm />)
    expect(screen.getByLabelText(/^name$/i)).toHaveValue('Rita Reporter')
    expect(screen.getByLabelText(/^email$/i)).toHaveValue('rita@example.com')
    expect(screen.getByRole('combobox')).toHaveTextContent('SRE')
  })

  it('keeps submit disabled and lists what is still needed until every field is valid', () => {
    render(<IncidentForm />)
    expect(submitButton()).toBeDisabled()

    const needed = screen.getByText('Still needed').parentElement
    expect(needed).not.toBeNull()
    const items = within(needed as HTMLElement).getAllByRole('listitem').map(li => li.textContent)
    expect(items).toEqual(expect.arrayContaining([
      'Title must be at least 50 characters',
      'Description must be at least 100 characters',
      'Symptoms must be at least 50 characters',
      'Pick at least one affected system'
    ]))

    type(/^title$/i, TITLE)
    type(/^description$/i, DESCRIPTION)
    type(/^symptoms$/i, SYMPTOMS)
    expect(submitButton()).toBeDisabled()
    expect(within(needed as HTMLElement).getAllByRole('listitem').map(li => li.textContent)).toEqual([
      'Pick at least one affected system'
    ])

    fireEvent.click(screen.getByRole('button', { name: 'Database' }))
    expect(screen.getByRole('button', { name: 'Database' })).toHaveAttribute('aria-pressed', 'true')
    expect(submitButton()).toBeEnabled()
    expect(screen.queryByText('Still needed')).toBeNull()
  })

  it('disables submit again when a field becomes invalid', () => {
    render(<IncidentForm />)
    fillValidForm()
    expect(submitButton()).toBeEnabled()
    type(/^email$/i, 'not-an-email')
    expect(submitButton()).toBeDisabled()
    expect(screen.getByText('Still needed')).toBeInTheDocument()
  })

  it('shows a character counter against the minimum, then the maximum', () => {
    render(<IncidentForm />)
    // Symptoms also has a 50-character minimum, so read the title's own counter
    const counter = (): HTMLElement | null => document.getElementById('title-count')
    expect(counter()).toHaveTextContent('0/50 min')
    type(/^title$/i, '  abc  ')
    expect(counter()).toHaveTextContent('3/50 min')
    type(/^title$/i, TITLE)
    expect(counter()).toHaveTextContent(`${TITLE.length}/255`)
    expect(screen.getByLabelText(/^title$/i)).toHaveAttribute('maxLength', '255')
  })

  it('shows a field error only after the field is touched', () => {
    render(<IncidentForm />)
    const title = screen.getByLabelText(/^title$/i)
    expect(title).toHaveAttribute('aria-invalid', 'false')
    type(/^title$/i, 'short')
    fireEvent.blur(title)
    expect(title).toHaveAttribute('aria-invalid', 'true')
    expect(document.getElementById('title-error')).toHaveTextContent('Title must be at least 50 characters')
  })

  it('submits without identity headers (the session cookie carries identity) and shows the done step', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      incident: { id: 'inc1', title: TITLE, severity: 'P3', status: 'OPEN', createdBy: 'Rita Reporter', createdAt: new Date().toISOString() },
      similarIncidents: []
    }), { status: 201, headers: { 'content-type': 'application/json' } }))

    render(<IncidentForm />)
    fillValidForm()
    fireEvent.click(submitButton())

    expect(await screen.findByText('Logged as a new incident')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open incident' })).toHaveAttribute('href', '/incidents/inc1')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe('/api/incidents/create')
    expect(init?.method).toBe('POST')
    expect(init?.headers).not.toHaveProperty('x-user-email')
    const body: unknown = JSON.parse(String(init?.body))
    expect(body).toMatchObject({ title: TITLE, affectedSystems: ['Database'], department: 'SRE', severity: 'P3' })
  })

  it('shows the server error and stays on the form when the API fails', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'Database unavailable' }), { status: 500 }))
    render(<IncidentForm />)
    fillValidForm()
    fireEvent.click(submitButton())
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Database unavailable'))
    expect(submitButton()).toBeEnabled()
  })
})
