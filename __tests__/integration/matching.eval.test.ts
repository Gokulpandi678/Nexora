/**
 * Matching quality evaluation (PRD success criterion: <5% false positives).
 *
 * Corpus: the 11 seed scenarios. Queries: reports written the way a *different* person would
 * describe the same problem (different words, partial symptoms), plus novel incidents that are
 * not in the corpus and should match nothing.
 *
 *   false-positive rate = wrong incidents shown / all incidents shown
 *   recall@1            = paraphrases whose top suggestion is the right incident
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { findSimilarIncidents, matchQueryFor } from '@/lib/search'
import { SCENARIOS } from '@/prisma/scenarios'
import { resetDb } from '../setup/helpers'

interface Probe {
  /** Index into SCENARIOS, or null for a novel incident that should not match */
  expect: number | null
  title: string
  symptoms: string
  description: string
  systems: string[]
}

const PROBES: Probe[] = [
  { expect: 0, systems: ['Database', 'API'], title: 'Orders failing at payment step, gateway timeouts everywhere',
    symptoms: 'Customers get 504s when placing orders. Service logs say the connection pool is exhausted, 20 of 20 in use.',
    description: 'Checkout broke around lunchtime. Postgres itself looks healthy but the app cannot get a connection.' },
  { expect: 1, systems: ['Cache', 'API'], title: 'Product pages very slow, Redis memory full and evicting keys',
    symptoms: 'Redis at maxmemory, evicted keys climbing fast, cache hit ratio collapsed. Catalog CPU maxed out.',
    description: 'After this morning deploy the product detail pages take several seconds to load.' },
  { expect: 2, systems: ['Auth'], title: 'Users in Tokyo cannot sign in via SSO, assertion rejected as expired',
    symptoms: 'SAML error NotOnOrAfter condition failed on login. Only Asia Pacific users affected.',
    description: 'Single sign-on is broken for the APAC office. Other regions log in fine.' },
  { expect: 3, systems: ['Email', 'Queue'], title: 'Customers not receiving order confirmation emails',
    symptoms: 'Email provider returning 429 Too Many Requests. Email queue depth keeps growing.',
    description: 'Support is flooded with tickets about missing confirmation emails.' },
  { expect: 4, systems: ['Storage'], title: 'Uploading documents fails with AccessDenied',
    symptoms: 'Uploads return 403 AccessDenied from object storage. Downloads still work.',
    description: 'Nobody can upload profile pictures since the infrastructure pipeline ran this afternoon.' },
  { expect: 5, systems: ['Frontend'], title: 'Blank page in Safari after release',
    symptoms: 'White screen on Safari only. Console shows SyntaxError invalid regular expression group specifier.',
    description: 'Safari users see nothing after we shipped the new release. Chrome works.' },
  { expect: 6, systems: ['Database'], title: 'Warehouse ETL crashed overnight with Java heap space error',
    symptoms: 'Nightly ETL job OutOfMemoryError Java heap space on the orders partition. Dashboards stale.',
    description: 'Finance dashboards have not refreshed because the nightly load keeps failing.' },
  { expect: 7, systems: ['Payments', 'API'], title: 'Payment webhooks rejected, invalid signature',
    symptoms: 'Our webhook endpoint returns 400 Invalid signature for every provider callback. Orders stuck pending payment.',
    description: 'Payments succeed at the provider but orders never update.' },
  { expect: 8, systems: ['Network'], title: 'Random EAI_AGAIN DNS errors between internal services',
    symptoms: 'getaddrinfo EAI_AGAIN intermittently, circuit breakers tripping, CoreDNS CPU high.',
    description: 'Services randomly fail to reach each other for a few seconds at a time.' },
  { expect: 9, systems: ['Queue'], title: 'New products not showing up in search results',
    symptoms: 'Indexing worker stopped consuming, index queue depth growing, no errors in worker logs.',
    description: 'Products added yesterday cannot be found through search.' },
  { expect: 10, systems: ['Frontend'], title: 'CSV export from admin dashboard is empty for long date ranges',
    symptoms: 'Export file only has headers when the range is over 90 days. Query timing out in logs.',
    description: 'Support cannot export quarterly reports.' },
  { expect: null, systems: ['Frontend'], title: 'Dark mode toggle does not persist after page reload',
    symptoms: 'Theme switches back to light every time the user refreshes the settings page.',
    description: 'Preference setting is not saved in local storage.' },
  { expect: null, systems: ['Other'], title: 'Office printer on floor 3 jams on double-sided printing',
    symptoms: 'Paper jam error E-204 whenever duplex is selected.',
    description: 'Facilities ticket, affects the finance team printer.' },
  { expect: null, systems: ['Network'], title: 'VPN client disconnects every 10 minutes for remote staff',
    symptoms: 'VPN tunnel drops with reason idle timeout, users must reconnect manually.',
    description: 'Remote employees in the sales team lose VPN connectivity repeatedly.' },
  { expect: null, systems: ['Auth'], title: 'Password reset link in email points to staging environment',
    symptoms: 'Reset links open staging.example.com instead of production.',
    description: 'Users cannot reset their passwords because the link host is wrong.' }
]

const ids: string[] = []

beforeAll(async () => {
  await resetDb()
  for (const s of SCENARIOS) {
    const created = await prisma.incident.create({
      data: {
        title: s.title, description: s.description, symptoms: s.symptoms, affectedSystems: s.systems,
        severity: s.severity, status: 'RESOLVED', createdBy: 'Seed', email: 'seed@example.com', department: 'SRE'
      }
    })
    ids.push(created.id)
  }
})

afterAll(async () => {
  await resetDb()
})

describe('similar-incident matching quality', () => {
  it('keeps false positives under 5% with high recall@1', async () => {
    let shown = 0
    let wrong = 0
    let hitsAt1 = 0
    const paraphrases = PROBES.filter(p => p.expect !== null).length
    const report: string[] = []

    for (const probe of PROBES) {
      const matches = await findSimilarIncidents(matchQueryFor(probe), { scope: { organizationId: null }, limit: 5, systems: probe.systems })
      const expectedId = probe.expect === null ? null : ids[probe.expect]
      const wrongHere = matches.filter(m => m.id !== expectedId)
      shown += matches.length
      wrong += wrongHere.length
      if (expectedId && matches[0]?.id === expectedId) hitsAt1 += 1
      report.push(`${probe.expect === null ? 'novel' : `#${probe.expect}`.padEnd(5)} ${probe.title.slice(0, 50).padEnd(50)} → ` +
        (matches.map(m => `${m.id === expectedId ? '✓' : '✗'}${m.similarity}%`).join(' ') || '(none)'))
    }

    const fpRate = shown ? wrong / shown : 0
    const recall = hitsAt1 / paraphrases
    console.log(`\n${report.join('\n')}\nshown=${shown} wrong=${wrong} FP=${(fpRate * 100).toFixed(1)}% recall@1=${(recall * 100).toFixed(0)}%`)

    expect(fpRate).toBeLessThan(0.05)
    expect(recall).toBeGreaterThanOrEqual(0.8)
  })
})
