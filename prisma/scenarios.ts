/** Realistic incident scenarios shared by the seed script and the matching evaluation. */

export interface Scenario {
  title: string
  description: string
  symptoms: string
  systems: string[]
  severity: 'P1' | 'P2' | 'P3' | 'P4'
  rootCause: string
  approach: string
  useCaseNotes: string
  timeToFix: number
  efficiency: 'HIGH' | 'MEDIUM' | 'LOW'
  /** How many later incidents recur as the SAME issue */
  recurrences: number
}

export const SCENARIOS: Scenario[] = [
  {
    title: 'Checkout API returns 504 Gateway Timeout when the database connection pool is exhausted',
    description: 'Starting around 14:05 UTC the checkout service began timing out for a large share of requests. Order volume was normal. Dashboards show the Postgres connection pool pinned at its maximum of 20 connections while query latency stayed low, which suggests connections are being held rather than queries being slow.',
    symptoms: 'HTTP 504 from /api/checkout after 30s. Logs: "TimeoutError: Connection pool exhausted (max 20)". p99 latency jumped from 300ms to 30s.',
    systems: ['Database', 'API', 'Payments'],
    severity: 'P1',
    rootCause: 'A new background job opened transactions without closing them on the error path, leaking connections until the pool was exhausted.',
    approach: '1. Restart checkout pods to release connections.\n2. Hotfix: wrap the job in `try/finally` and release the client.\n3. Set `idle_in_transaction_session_timeout = 60s` on the database.',
    useCaseNotes: 'Use when pool usage is at max but query latency is normal. Will not help if queries themselves are slow (check pg_stat_activity first).',
    timeToFix: 75,
    efficiency: 'HIGH',
    recurrences: 3
  },
  {
    title: 'Redis cache eviction storm causes product page latency spike across all regions',
    description: 'Product pages became slow for roughly 40 minutes. Redis memory hit maxmemory and the allkeys-lru policy evicted hot keys, causing a thundering herd of cache misses that overloaded the catalog service and the primary database behind it.',
    symptoms: 'Product page p95 latency 4s (normally 250ms). Redis evicted_keys spiking to 50k/s, cache hit ratio dropped from 97% to 40%. Catalog service CPU at 100%.',
    systems: ['Cache', 'API', 'Database'],
    severity: 'P2',
    rootCause: 'A deploy started caching full search results without a TTL, filling Redis memory and evicting product keys.',
    approach: 'Flushed the search-result keyspace, added a 10 minute TTL to search caching, and raised maxmemory alerting to fire at 80%.',
    useCaseNotes: 'Use when evicted_keys spikes after a deploy. Check `redis-cli --bigkeys` to find the offender first.',
    timeToFix: 50,
    efficiency: 'HIGH',
    recurrences: 2
  },
  {
    title: 'SSO login fails with SAML assertion expired error for users in the APAC region',
    description: 'Users in Singapore and Tokyo could not log in through SSO for about two hours. Other regions were unaffected. The identity provider logs show assertions being rejected as expired immediately after issue.',
    symptoms: 'Login page shows "SAML assertion expired". Auth service logs: "NotOnOrAfter condition failed". Only hosts in ap-southeast-1 affected.',
    systems: ['Auth', 'Network'],
    severity: 'P2',
    rootCause: 'NTP was blocked by a security group change on the APAC auth hosts, so their clocks drifted four minutes ahead.',
    approach: 'Re-opened UDP 123 to the NTP pool, forced a clock sync with `chronyc makestep`, and added a clock-skew alert at 30s.',
    useCaseNotes: 'Use when SAML/JWT validation fails only on some hosts. Compare `date` across hosts before touching IdP config.',
    timeToFix: 120,
    efficiency: 'HIGH',
    recurrences: 1
  },
  {
    title: 'Order confirmation emails delayed by over an hour because the email queue backed up',
    description: 'Customers reported not receiving order confirmation emails. The email worker queue grew to 180k messages. Workers were running but processing slowly because the email provider started rate limiting our account.',
    symptoms: 'Queue depth 180k and rising. Worker logs: "429 Too Many Requests" from the email API. Support tickets mentioning missing confirmations.',
    systems: ['Queue', 'Email'],
    severity: 'P3',
    rootCause: 'A marketing campaign was sent through the transactional email account, consuming the rate limit.',
    approach: 'Paused the campaign, moved marketing to a separate sending domain, and added priority queues so transactional mail goes first.',
    useCaseNotes: 'Use when the provider returns 429s. Check for bulk sends on the same account before scaling workers (more workers make it worse).',
    timeToFix: 90,
    efficiency: 'MEDIUM',
    recurrences: 2
  },
  {
    title: 'File uploads fail with 403 AccessDenied after storage bucket policy change',
    description: 'All profile picture and document uploads started failing after an infrastructure change was applied. Downloads of existing files kept working.',
    symptoms: 'Upload requests return 403 "AccessDenied" from object storage. Error rate on /api/uploads 100%. Started right after the infra pipeline ran.',
    systems: ['Storage', 'API'],
    severity: 'P2',
    rootCause: 'The bucket policy was rewritten and dropped s3:PutObject for the upload service role.',
    approach: 'Restored the PutObject statement for the service role and added a policy test to the infra pipeline.',
    useCaseNotes: 'Use when writes fail but reads work right after an infra change. Diff the bucket policy first.',
    timeToFix: 35,
    efficiency: 'HIGH',
    recurrences: 0
  },
  {
    title: 'Frontend shows blank white screen for Safari users after the latest release',
    description: 'Safari 16 users saw a blank page after release 4.18. Chrome and Firefox were fine. The JavaScript bundle failed to parse in Safari.',
    symptoms: 'Blank white screen in Safari. Console: "SyntaxError: Invalid regular expression: invalid group specifier name". Only Safari < 16.4.',
    systems: ['Frontend'],
    severity: 'P2',
    rootCause: 'A dependency upgrade shipped regex lookbehind, which older Safari does not support, and the browserslist target excluded it from transpiling.',
    approach: 'Rolled back the release, pinned the dependency, and added Safari 15 to browserslist and the cross-browser smoke test.',
    useCaseNotes: 'Use when a single browser shows a blank page after a release. Check the console for SyntaxError first.',
    timeToFix: 60,
    efficiency: 'MEDIUM',
    recurrences: 1
  },
  {
    title: 'Nightly data warehouse ETL job fails with out of memory error on large partitions',
    description: 'The nightly ETL that loads orders into the warehouse failed three nights in a row. Morning dashboards showed stale data and finance reports were delayed.',
    symptoms: 'ETL job exits with "java.lang.OutOfMemoryError: Java heap space" while processing the orders partition. Dashboards show data from three days ago.',
    systems: ['Database', 'Queue'],
    severity: 'P3',
    rootCause: 'The orders partition grew past the executor memory after Black Friday traffic; the job loaded the full partition into memory.',
    approach: 'Switched the job to stream partitions in 100k-row chunks and raised executor memory from 4G to 8G as a buffer.',
    useCaseNotes: 'Use when ETL OOMs on one large partition. Chunking is the fix; raising memory alone only delays the next failure.',
    timeToFix: 240,
    efficiency: 'HIGH',
    recurrences: 1
  },
  {
    title: 'Payment webhook signature verification failing after provider rotated signing secret',
    description: 'Payment confirmations stopped updating order status. The payment provider was delivering webhooks but our endpoint rejected them as invalid.',
    symptoms: 'Webhook endpoint returns 400 "Invalid signature". Orders stuck in PENDING_PAYMENT. Provider dashboard shows repeated delivery failures.',
    systems: ['Payments', 'API', 'Auth'],
    severity: 'P1',
    rootCause: 'The provider rotated the webhook signing secret; the new secret was never added to our secret store.',
    approach: 'Added the new secret, accepted both old and new secrets during the rotation window, and replayed failed webhooks from the provider dashboard.',
    useCaseNotes: 'Use when all webhooks suddenly fail signature checks. Check the provider for a secret rotation notice.',
    timeToFix: 45,
    efficiency: 'HIGH',
    recurrences: 0
  },
  {
    title: 'Internal DNS resolution intermittently fails causing random service-to-service errors',
    description: 'Several services reported sporadic connection errors to other internal services. Failures were random and short-lived but frequent enough to trip circuit breakers.',
    symptoms: 'Intermittent "getaddrinfo EAI_AGAIN" errors in logs across services. Circuit breakers opening. CoreDNS pods showing high CPU.',
    systems: ['Network', 'API'],
    severity: 'P2',
    rootCause: 'CoreDNS was under-provisioned after cluster growth and ndots:5 multiplied every lookup by five.',
    approach: 'Scaled CoreDNS to 6 replicas, enabled NodeLocal DNSCache, and set ndots:2 in pod DNS config.',
    useCaseNotes: 'Use for random EAI_AGAIN across many services. Check CoreDNS CPU and query rate first.',
    timeToFix: 180,
    efficiency: 'HIGH',
    recurrences: 2
  },
  {
    title: 'Search results missing newly added products because indexing worker stopped silently',
    description: 'Merchandising reported that products added in the last day did not appear in search. The indexing worker process was running but not consuming messages.',
    symptoms: 'New products absent from search. Index queue depth growing steadily. Worker logs stopped at 02:14 with no error. Process still alive.',
    systems: ['Queue', 'API'],
    severity: 'P3',
    rootCause: 'The worker deadlocked on a lock held by a crashed consumer; no liveness probe checked message progress.',
    approach: 'Restarted the worker, added a liveness probe based on last-processed timestamp, and alert on queue depth growth.',
    useCaseNotes: 'Use when a worker is alive but queue depth grows. Restart unblocks it; the probe prevents silent stalls.',
    timeToFix: 30,
    efficiency: 'MEDIUM',
    recurrences: 1
  },
  {
    title: 'Admin dashboard export button produces empty CSV for date ranges longer than 90 days',
    description: 'Support staff exporting reports over long ranges received empty files. Short ranges worked. No errors were shown to users.',
    symptoms: 'CSV download contains only headers when range > 90 days. API logs show the export query timing out after 30s and returning an empty result.',
    systems: ['Frontend', 'Database'],
    severity: 'P4',
    rootCause: 'The export swallowed query timeouts and returned an empty result instead of an error.',
    approach: 'Surface timeouts as an error and move long exports to an async job that emails a download link.',
    useCaseNotes: 'Use when exports are empty for large ranges only.',
    timeToFix: 300,
    efficiency: 'MEDIUM',
    recurrences: 0
  }
]
