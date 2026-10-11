import { expect, test, type Page } from '@playwright/test'

const runId = Date.now().toString(36)
const profile = { name: `E2E Verifier ${runId}`, email: `e2e-${runId}@example.com` }

/** Opens a Radix Select by its trigger and picks an option. */
async function choose(page: Page, triggerSelector: string, option: string): Promise<void> {
  await page.locator(triggerSelector).click()
  await page.getByRole('option', { name: option, exact: true }).click()
  await expect(page.locator(triggerSelector)).toContainText(option)
}

async function setUpProfile(page: Page): Promise<void> {
  await page.goto('/settings')
  await page.getByLabel('Name').fill(profile.name)
  await page.getByLabel('Email').fill(profile.email)
  await choose(page, '#s-dept', 'SRE')
  await choose(page, '#s-role', 'QA verifier')
  await page.getByRole('button', { name: 'Save profile' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible()
}

test.describe('critical flows', () => {
  test('report → link → resolve with a solution → verify → discuss', async ({ page }) => {
    // Several pages may compile on first visit in dev mode
    test.setTimeout(240_000)
    await setUpProfile(page)

    // Report: worded like the seeded "connection pool exhausted" incident so matching has something to find
    const title = `Checkout API returning 504 timeouts, database connection pool exhausted (e2e ${runId})`
    // Client-side navigation, as a user would: the profile store is already hydrated here
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Report incident' }).click()
    await expect(page).toHaveURL(/\/incidents\/new$/)
    // Reporter fields come from the profile
    await expect(page.getByLabel('Email', { exact: true })).toHaveValue(profile.email)
    await expect(page.locator('#department')).toContainText('SRE')
    await page.getByLabel('Title', { exact: true }).fill(title)
    await page.getByLabel('Description', { exact: true }).fill(
      'Since the lunchtime deploy most checkout requests time out. Postgres looks healthy and query latency is low, ' +
      'but the application cannot get a database connection from the pool.'
    )
    await page.getByLabel('Symptoms', { exact: true }).fill(
      'HTTP 504 Gateway Timeout from /api/checkout. Logs: TimeoutError acquiring connection, pool exhausted 20/20 in use.'
    )
    await page.getByRole('button', { name: 'Database', exact: true }).click()
    await page.getByRole('button', { name: 'API', exact: true }).click()
    await page.getByText('P2 · High').click()
    await choose(page, '#department', 'Platform')
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue(profile.name)

    const submit = page.getByRole('button', { name: 'Report & check for matches' })
    await expect(submit).toBeEnabled()
    await submit.click()

    const matchesHeading = page.getByRole('heading', { name: /We found \d+ similar past incident/ })
    const newIncident = page.getByText('Logged as a new incident')
    await expect(matchesHeading.or(newIncident)).toBeVisible()

    if (await matchesHeading.isVisible()) {
      await page.getByRole('button', { name: 'Yes, same issue' }).first().click()
      await page.getByRole('button', { name: 'Confirm link' }).click()
      await expect(page.getByText('Linked to a past incident')).toBeVisible()
    }

    // Open the incident
    await page.getByRole('link', { name: 'Open incident' }).click()
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible({ timeout: 90_000 })

    // Add a solution
    const approach = `Restarted the API pods and wrapped connection checkout in try/finally (${runId})`
    await page.getByRole('button', { name: 'Add solution' }).click()
    const dialog = page.getByRole('dialog', { name: 'Add a solution' })
    await dialog.getByLabel('Root cause').fill('Retry path leaked connections on timeout so the pool never drained')
    await dialog.getByLabel('Approach — what fixed it').fill(approach)
    await dialog.getByLabel('Time to fix (minutes)').fill('45')
    await dialog.getByLabel('When to use this fix').fill('Use when the pool is pinned at max while queries stay fast')
    await dialog.getByLabel('Fix verified in staging or test').check()
    await expect(dialog.getByLabel('Fix verified in staging or test')).toBeChecked()
    await dialog.getByRole('button', { name: /^Save solution/ }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByText(approach)).toBeVisible()
    await expect(page.getByText('Resolved').first()).toBeVisible()

    // Verify it (profile role is QA verifier)
    await page.getByRole('button', { name: 'Show details' }).first().click()
    await page.getByRole('button', { name: 'Verify (QA approve)' }).click()
    await expect(page.getByText(`Verified by ${profile.name}`)).toBeVisible()

    // Comment
    const commentText = `Monitoring for pool saturation added (${runId})`
    await page.getByRole('combobox', { name: 'Add a comment' }).fill(commentText)
    await page.getByRole('button', { name: 'Comment', exact: true }).click()
    await expect(page.getByText(commentText)).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Add a comment' })).toHaveValue('')
  })

  test('browse: search filters the table', async ({ page }) => {
    await page.goto('/incidents')
    const rows = page.locator('table tbody tr')
    await expect(rows.first()).toBeVisible()
    const before = await rows.count()

    await page.getByRole('searchbox', { name: 'Search incidents', exact: true }).fill('safar')
    await expect(page.getByText(/incidents? matching “safar”/)).toBeVisible()
    await expect(rows.first()).toBeVisible()

    const titles = await rows.locator('td:first-child a').allTextContents()
    expect(titles.length).toBeGreaterThan(0)
    expect(titles.length).toBeLessThan(before)
    for (const t of titles) expect(t.toLowerCase()).toContain('safari')
  })

  test('analytics renders KPI cards', async ({ page }) => {
    await page.goto('/analytics')
    await expect(page.getByRole('heading', { level: 1, name: 'Patterns & analytics' })).toBeVisible()
    for (const label of ['Incidents this month', 'Avg MTTR', 'Recurring rate', 'Resolution rate']) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible()
    }
    await expect(page.getByText(/^\d+(\.\d+)?%$/).first()).toBeVisible()
  })
})
