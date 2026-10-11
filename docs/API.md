# API reference

Base path: `/api`. All request and response bodies are JSON. Dates are ISO 8601 strings (UTC).

## Conventions

**Identity.** Until SSO is connected, the caller identifies themselves with headers (values URI-encoded):

| Header | Example |
| --- | --- |
| `x-user-name` | `Priya%20Raman` |
| `x-user-email` | `priya%40example.com` |
| `x-user-department` | `SRE` |
| `x-user-role` | `VIEWER` · `REPORTER` · `VERIFIER` · `ADMIN` |

Endpoints marked 🔒 require identity (401 without it). A role in brackets is the minimum (403 below it).

**Errors.** `{ "error": "Human-readable message", "fieldErrors"?: { "title": ["Title must be at least 50 characters"] } }`

| Status | Meaning |
| --- | --- |
| 400 | Validation failed (`fieldErrors` lists each field) |
| 401 / 403 | Missing identity / insufficient role |
| 404 | Not found (soft-deleted incidents also return 404) |
| 403 | Cross-origin state-changing request (CSRF guard) |
| 415 | State-changing request without `Content-Type: application/json` |
| 429 | Rate limit exceeded; see `Retry-After` |
| 500 | Unexpected error. Details are logged server-side, never returned |

**Pagination.** `?page=1&pageSize=20` (max 100) → `{ items, page, pageSize, total, totalPages }`.

Every response carries `Server-Timing: app;dur=<ms>` and `X-RateLimit-Remaining`.

---

## Incidents

### `POST /api/incidents/create` (also `POST /api/incidents`)
Report an incident. Returns it with up to 5 similar past incidents.

```json
{
  "title": "50–255 chars",
  "description": "100–5000 chars, markdown",
  "symptoms": "50–2000 chars",
  "initialFixes": "optional, ≤2000",
  "affectedSystems": ["Database", "API"],
  "severity": "P1 | P2 | P3 | P4",
  "department": "Engineering | Platform | SRE | Data | Security | IT | Support | Product | Unassigned",
  "estimatedMTTR": 30,
  "tags": ["optional", "≤10"],
  "createdBy": "Reporter name",
  "email": "reporter@example.com"
}
```
→ `201 { incident: IncidentRef, similarIncidents: SimilarIncident[] }`

`SimilarIncident` includes `similarity` (1–99), `sharedTerms`, `sharedSystems`, `recurringCount` and `solutions` (id, approach, status, timeToFix, efficiency, solvedBy). Recurrences are collapsed onto their root incident. P1s also notify `ONCALL_EMAIL`.

### `GET /api/incidents`
Paginated list. Query parameters (all optional):

| Param | Notes |
| --- | --- |
| `q` | Full-text, prefix-matched (`conn poo` finds "connection pool") |
| `status`, `severity`, `systems` | Repeat or comma-separate: `status=OPEN,INVESTIGATING` |
| `department` | Exact |
| `from`, `to` | Dates, inclusive (`2026-10-01`) |
| `recurring` | `true` (recurrences and roots that recurred) · `false` |
| `sort` | `newest` (default) · `oldest` · `mttr` · `severity` · `recurring` · `relevance` (default with `q`) |
| `page`, `pageSize` | Default 1 / 20 |

→ `Paginated<IncidentListItem>`: id, title, symptoms (≤240 chars), severity, status, affectedSystems, tags, department, createdBy, createdAt, resolvedAt, actualMTTR, recurringCount, linkedToId, solutionCount, verifiedSolutionCount, commentCount, score.

### `GET /api/incidents/search`
Same parameters and response as the list; sorts by relevance when `q` is present.

### `GET /api/incidents/:id`
Full incident: all fields plus `solutions`, `linkedTo` (root, with its solutions), `linkedFrom`, `matchedAs` (links to earlier incidents), `matchedFrom` (later incidents linked here), `commentCount`, `activity` (latest 100).

### `PATCH /api/incidents/:id` 🔒 [REPORTER]
`{ status?, severity?, department?, tags? }` (at least one). Each change is audit-logged. Moving to `RESOLVED`/`CLOSED` sets `resolvedAt` and `actualMTTR` (minutes from report to first resolution). Reopening clears them. The reporter is emailed on status change. → updated incident.

### `DELETE /api/incidents/:id` 🔒 [ADMIN]
Soft delete. → `204`.

### `GET /api/incidents/:id/matches?limit=5`
Similar incidents (max 20), excluding ones already linked.

### `POST /api/incidents/:id/link` 🔒
Link this (newer) incident to an earlier one.
```json
{ "originalIncidentId": "…", "matchType": "SAME | SIMILAR | DERIVED", "solutionUsed": "solution id (optional)", "notes": "optional" }
```
`SAME` points the incident at the original's *root* and refreshes `recurringCount`. Re-linking with another type removes it from the chain. The original owner is emailed once per new incident, unless they are the caller or reported both. → `{ link, notified, ownerName }`

### `GET /api/incidents/:id/activity?page=1`
Audit trail, newest first. `action` ∈ CREATED, UPDATED, STATUS_CHANGED, LINKED, SOLUTION_ADDED, VERIFIED, COMMENTED, OUTCOME_RECORDED, DELETED.

## Solutions

### `GET /api/incidents/:id/solutions`
Verified first, then unverified, then deprecated.

### `POST /api/incidents/:id/solutions` 🔒
```json
{
  "rootCause": "≥10 chars", "approach": "≥10 chars", "useCaseNotes": "≥10 chars",
  "timeToFix": 45, "efficiency": "HIGH | MEDIUM | LOW",
  "qaChecks": ["root-cause-confirmed", "fix-verified", "monitoring", "rollback", "documented"],
  "preventionRules": "optional", "monitoring": "optional",
  "resolve": true
}
```
`solvedBy`/`email` come from the caller. `resolve` (default true) also resolves the incident. → `201 Solution`

### `GET /api/solutions/:id`

### `PATCH /api/solutions/:id/verify` 🔒 [VERIFIER]
`{ "status": "VERIFIED" | "UNVERIFIED" | "DEPRECATED" }` (default VERIFIED). Records `verifiedBy`/`verifiedAt` and notifies the solver.

### `GET /api/solutions/:id/effectiveness`
`{ timesUsed, worked, failed, pending, successRate, originalMTTR, avgMTTRWhenUsed, mttrImprovement }`. Based on links that named this solution as `solutionUsed`.

### `PATCH /api/links/:id` 🔒
`{ "didSolutionWork": true, "outcome"?: "RESOLVED | RETRY_NEEDED | DIFFERENT_APPROACH_NEEDED" }`. Records whether the reused fix worked.

## Comments

### `GET /api/incidents/:id/comments?page=1`
Top-level comments, oldest first, each with `replies`.

### `POST /api/incidents/:id/comments` 🔒
`{ "content": "1–5000 chars", "parentId"?: "…", "mentions"?: ["email", …] }`. Threads are one level deep: replying to a reply attaches to its top-level comment. Each mentioned email (other than the caller) gets a notification. → `201 Comment`

## Analytics

| Endpoint | Returns |
| --- | --- |
| `GET /api/stats/dashboard` | `totals {all, thisMonth, lastMonth, open, openP1}`, `avgMTTR`, `recurringRate` %, `resolutionRate` %, `verifiedSolutions`, `totalSolutions`, `byStatus`, `bySeverity`, `bySystem` (top 10), `topRecurring` (10, with avg MTTR and last occurrence), `recent` (8) |
| `GET /api/stats/trends?days=30` | `points[]` per UTC day (7–365 days, zero-filled): incidents, P1–P4, resolved, avgMTTR; plus `thisWeek`, `lastWeek` |
| `GET /api/stats/systems` | Per system: incidents, open, recurring, avgMTTR |
| `GET /api/stats/teams` | `teams[]` (department, incidents, open, avgMTTR, topSolver), `topSolvers[]`, `heatmap[]` (department × system counts) |

## Other

| Endpoint | Notes |
| --- | --- |
| `GET /api/export/csv` | Accepts the list filters; up to 5,000 rows. Cells starting with `= + - @` are prefixed to prevent formula injection |
| `GET /api/notifications` 🔒 [VIEWER] | Caller's latest 20 + `unread` count |
| `PATCH /api/notifications` 🔒 [VIEWER] | `{ ids?: string[] }` marks the given notifications (or all) read |
| `GET /api/people?q=` | Known people (reporters, solvers, commenters) for @mentions |
| `GET /api/health` | `200 {status:"ok", db:"ok", latencyMs}` or `503`. Exempt from rate limiting |
