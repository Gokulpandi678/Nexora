/**
 * Records a product demo of Nexora as video, scene by scene, for editing into a feature video.
 *
 *   npm run demo:record                                   # records https://nexora-one-flax.vercel.app
 *   DEMO_BASE_URL=http://localhost:3000 npm run demo:record
 *
 * First run: a browser window opens on the login page. Sign in (as an organization admin, so the
 * admin scenes work) and the session is saved to demo/auth.json for later runs. Delete that file to
 * sign in again. Seed demo data first: npm run demo:seed -- --org <slug> --team --notify <your email>
 *
 * Output, in demo/:
 *   01-landing.webm   the public landing page (signed out)
 *   02-app.webm       the product tour (signed in)
 *   scenes.txt        when each scene starts in 02-app.webm, for cutting and voiceover
 *
 * Note: the tour reports one real incident, adds a solution and a comment to it, as a user would.
 * A scene whose element is missing is logged and skipped, so one UI change never ruins a take.
 */
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Locator, type Page } from '@playwright/test'

const BASE_URL = (process.env.DEMO_BASE_URL ?? 'https://nexora-one-flax.vercel.app').replace(/\/$/, '')
const OUT = join(process.cwd(), 'demo')
const AUTH = join(OUT, 'auth.json')
const SIZE = { width: 1920, height: 1080 }
/** Multiplies every pause; raise it for a slower, more narrated pace. */
const PACE = Number(process.env.DEMO_PACE ?? 1)

const wait = (page: Page, ms: number): Promise<void> => page.waitForTimeout(ms * PACE)

/** A visible cursor and click ripple: Playwright's video does not show the real mouse. */
const CURSOR_SCRIPT = `
  window.addEventListener('DOMContentLoaded', () => {
    const dot = document.createElement('div')
    dot.style.cssText = 'position:fixed;left:0;top:0;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;' +
      'background:rgba(139,92,246,.35);border:2px solid #8b5cf6;pointer-events:none;z-index:2147483647;transition:transform .12s'
    document.body.appendChild(dot)
    document.addEventListener('mousemove', e => { dot.style.left = e.clientX + 'px'; dot.style.top = e.clientY + 'px' }, true)
    document.addEventListener('mousedown', () => { dot.style.transform = 'scale(.7)' }, true)
    document.addEventListener('mouseup', () => { dot.style.transform = 'scale(1)' }, true)
  })
`

/** Glides the cursor to an element, pauses so viewers see the target, then clicks. */
async function click(page: Page, target: Locator): Promise<void> {
  await target.scrollIntoViewIfNeeded()
  const box = await target.boundingBox()
  if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 30 })
  await wait(page, 350)
  await target.click()
}

/** Types like a person, so viewers can read along. */
async function type(page: Page, target: Locator, text: string, delay = 18): Promise<void> {
  await click(page, target)
  await target.pressSequentially(text, { delay })
  await wait(page, 300)
}

/** Scrolls the page down and back up in small steps. */
async function tour(page: Page, distance = 1600, back = true): Promise<void> {
  for (let y = 0; y < distance; y += 40) {
    await page.mouse.wheel(0, 40)
    await page.waitForTimeout(25)
  }
  await wait(page, 900)
  if (back) {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
    await wait(page, 900)
  }
}

async function go(page: Page, path: string): Promise<void> {
  await page.goto(`${BASE_URL}${path}`, { waitUntil: 'networkidle' })
  await wait(page, 1200)
}

/** Opens a sign-in window once and saves the session for the recording runs. */
async function signIn(browser: Browser): Promise<void> {
  const context = await browser.newContext({ viewport: SIZE })
  const page = await context.newPage()
  await page.goto(`${BASE_URL}/login`)
  console.log('Sign in in the browser window (waiting up to 5 minutes)…')
  await page.waitForURL(url => /\/(dashboard|superadmin|onboarding)/.test(url.pathname), { timeout: 300_000 })
  await context.storageState({ path: AUTH })
  await context.close()
  console.log(`Session saved to ${AUTH}`)
}

/** Records one clip; the video file is renamed once the context closes. */
async function record(browser: Browser, name: string, signedIn: boolean, scenes: (page: Page) => Promise<void>): Promise<void> {
  const context = await browser.newContext({
    viewport: SIZE,
    recordVideo: { dir: OUT, size: SIZE },
    ...(signedIn && { storageState: AUTH })
  })
  await context.addInitScript(CURSOR_SCRIPT)
  const page = await context.newPage()
  const video = page.video()
  try {
    await scenes(page)
  } finally {
    await context.close()
    const file = await video?.path()
    if (file) renameSync(file, join(OUT, name))
    console.log(`Saved demo/${name}`)
  }
}

/** Runs a scene, noting its start time; a failing scene is logged and skipped. */
function sceneRunner(page: Page, log: string[]): (title: string, run: () => Promise<void>) => Promise<void> {
  const started = Date.now()
  return async (title, run) => {
    const at = Math.round((Date.now() - started) / 1000)
    log.push(`${String(Math.floor(at / 60)).padStart(2, '0')}:${String(at % 60).padStart(2, '0')}  ${title}`)
    console.log(`▶ ${title}`)
    try {
      await run()
    } catch (error) {
      console.warn(`  skipped: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`)
      await page.keyboard.press('Escape').catch(() => undefined)
    }
  }
}

async function landing(page: Page): Promise<void> {
  await go(page, '/')
  await wait(page, 1500)
  await tour(page, 5000)
}

async function app(page: Page, log: string[]): Promise<void> {
  const scene = sceneRunner(page, log)
  const nav = page.getByRole('navigation', { name: 'Main navigation' })
  const reportTitle = 'Checkout requests timing out, database connection pool exhausted after deploy'

  await scene('Dashboard', async () => {
    await go(page, '/dashboard')
    await wait(page, 1500)
    await tour(page, 1400)
  })

  await scene('Notifications', async () => {
    await click(page, page.getByRole('button', { name: /^Notifications/ }))
    await wait(page, 2500)
    await page.keyboard.press('Escape')
  })

  await scene('Command palette (Ctrl+K)', async () => {
    await page.keyboard.press('Control+k')
    await wait(page, 600)
    await page.keyboard.type('redis', { delay: 120 })
    await wait(page, 2000)
    await page.keyboard.press('Escape')
  })

  await scene('Report an incident', async () => {
    await click(page, nav.getByRole('link', { name: 'Report incident' }))
    await page.waitForURL(/\/incidents\/new$/)
    await wait(page, 1000)
    await type(page, page.getByLabel('Title', { exact: true }), reportTitle)
    await type(page, page.getByLabel('Description', { exact: true }),
      'Since the 14:00 deploy most checkout requests time out. Postgres is healthy and query latency is low, ' +
      'but the API cannot get a connection from the pool.', 8)
    await type(page, page.getByLabel('Symptoms', { exact: true }),
      'HTTP 504 from /api/checkout after 30s. Logs: TimeoutError acquiring connection, pool exhausted 20/20.', 8)
    await click(page, page.getByRole('button', { name: 'Database', exact: true }))
    await click(page, page.getByRole('button', { name: 'API', exact: true }))
    await click(page, page.getByText('P1 · Critical'))
    await wait(page, 800)
  })

  await scene('Matching: similar past incidents and their fixes', async () => {
    await click(page, page.getByRole('button', { name: 'Report & check for matches' }))
    const matches = page.getByRole('heading', { name: /We found \d+ similar past incident/ })
    await matches.or(page.getByText('Logged as a new incident')).waitFor({ timeout: 30_000 })
    await wait(page, 2500)
    if (await matches.isVisible()) {
      await tour(page, 900)
      await click(page, page.getByRole('button', { name: 'Yes, same issue' }).first())
      await wait(page, 800)
      await click(page, page.getByRole('button', { name: 'Confirm link' }))
      await page.getByText('Linked to a past incident').waitFor()
      await wait(page, 2000)
    }
  })

  await scene('Incident detail', async () => {
    await click(page, page.getByRole('link', { name: 'Open incident' }))
    await page.getByRole('heading', { level: 1 }).waitFor({ timeout: 60_000 })
    await wait(page, 1500)
    await tour(page, 1200)
  })

  await scene('Add a solution', async () => {
    await click(page, page.getByRole('button', { name: 'Add solution' }))
    const dialog = page.getByRole('dialog', { name: 'Add a solution' })
    await dialog.waitFor()
    await type(page, dialog.locator('#sol-rootCause'), 'The new retry path leaked connections on timeout, so the pool never drained.', 10)
    await type(page, dialog.locator('#sol-approach'), 'Restarted the API pods, then wrapped connection checkout in try/finally.', 10)
    await type(page, dialog.locator('#sol-timeToFix'), '45')
    await type(page, dialog.locator('#sol-useCaseNotes'), 'Use when the pool sits at max while queries stay fast.', 10)
    await click(page, dialog.locator('#qa-root-cause-confirmed'))
    await click(page, dialog.locator('#qa-fix-verified'))
    await wait(page, 600)
    await click(page, dialog.getByRole('button', { name: /^Save solution/ }))
    await dialog.waitFor({ state: 'hidden' })
    await wait(page, 2000)
  })

  await scene('QA verification', async () => {
    await click(page, page.getByRole('button', { name: 'Show details' }).first())
    await wait(page, 1200)
    await click(page, page.getByRole('button', { name: 'Verify (QA approve)' }))
    await page.getByText(/^Verified by /).first().waitFor()
    await wait(page, 2000)
  })

  await scene('Discussion and activity', async () => {
    const box = page.getByRole('combobox', { name: 'Add a comment' })
    await type(page, box, 'Added an alert on pool saturation so we catch this before customers do.', 20)
    await click(page, page.getByRole('button', { name: 'Comment', exact: true }))
    await wait(page, 1500)
    await tour(page, 2000)
  })

  await scene('Incident list and search', async () => {
    await click(page, nav.getByRole('link', { name: /^Incidents/ }))
    await page.locator('table tbody tr').first().waitFor()
    await wait(page, 1500)
    await type(page, page.getByRole('searchbox', { name: 'Search incidents', exact: true }), 'timeout', 120)
    await wait(page, 2500)
  })

  await scene('Exports: CSV, PDF, email', async () => {
    await click(page, page.getByRole('button', { name: 'Export' }))
    await wait(page, 2500)
    await page.keyboard.press('Escape')
  })

  await scene('Analytics', async () => {
    await click(page, nav.getByRole('link', { name: 'Analytics' }))
    await page.getByRole('heading', { level: 1 }).waitFor()
    await wait(page, 2000)
    await tour(page, 3000)
  })

  await scene('Members, roles and join requests', async () => {
    await go(page, '/admin/members')
    await tour(page, 1200)
  })

  await scene('Organization settings', async () => {
    await go(page, '/admin/organization')
    await tour(page, 800)
  })

  await scene('Multiple organizations', async () => {
    await click(page, nav.getByRole('link', { name: 'Organizations' }))
    await wait(page, 2500)
  })

  await scene('Personal settings and UI styles', async () => {
    await click(page, nav.getByRole('link', { name: 'Settings' }))
    await wait(page, 1500)
    const styles = page.getByRole('radiogroup', { name: 'UI style' }).getByRole('radio')
    const count = await styles.count()
    const current = await styles.evaluateAll(els => els.findIndex(el => el.getAttribute('aria-checked') === 'true'))
    for (let i = 0; i < count; i++) {
      await click(page, styles.nth(i))
      await wait(page, 1400)
    }
    if (current >= 0) await click(page, styles.nth(current))
  })

  await scene('Back to the dashboard', async () => {
    await click(page, nav.getByRole('link', { name: 'Dashboard' }))
    await wait(page, 3000)
  })
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch({ headless: false })
  try {
    if (!existsSync(AUTH)) await signIn(browser)
    console.log(`Recording ${BASE_URL}`)
    await record(browser, '01-landing.webm', false, landing)
    const log: string[] = []
    await record(browser, '02-app.webm', true, page => app(page, log))
    writeFileSync(join(OUT, 'scenes.txt'), `Scenes in 02-app.webm\n\n${log.join('\n')}\n`)
    console.log('Saved demo/scenes.txt')
  } finally {
    await browser.close()
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
