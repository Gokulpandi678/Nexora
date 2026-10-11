# Nexora

**Incident intelligence for teams.** Report an incident and see straight away whether it has happened before, what fixed it, and who to ask. Recurring incidents get linked to the original, the original solver is notified, and fixes that worked get QA-verified so they rank first next time.

**Stack:** Next.js 15 (App Router) · TypeScript (strict) · Tailwind CSS 3 + shadcn-style Radix components · PostgreSQL + Prisma 6 · SWR + Zustand · Resend (email) · Vitest + Playwright

| Doc | For |
| --- | --- |
| [docs/API.md](docs/API.md) | Every endpoint, parameters and responses |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Data model, matching algorithm, auth, security, performance |
| [docs/RUNBOOK.md](docs/RUNBOOK.md) | Deploying, migrating, monitoring and troubleshooting in production |

---

## Quick start (local)

Prerequisites: Node.js 20.9+ (22 recommended), Docker.

```bash
npm install
cp .env.example .env.local          # defaults point at the local Docker database
npm run db:up                       # Postgres 16 on localhost:5433
npx prisma migrate deploy           # create the schema
npm run db:seed                     # optional: ~25 realistic incidents with recurrences and fixes
npm run dev                         # http://localhost:3000
```

Before `npm run dev`, set up WorkOS (see [Authentication & organizations](#authentication--organizations)) and put your own email in `SUPERADMIN_EMAILS`. Sign in, invite an organization from `/superadmin`, then accept the invite as its admin.

> **Prisma reads `.env`, not `.env.local`.** If your `.env` points somewhere else (e.g. Supabase), prefix CLI commands with the local URL, e.g.
> `DATABASE_URL=postgresql://postgres:postgres@localhost:5433/incident_tracker npx prisma migrate deploy`.

## Pages & navigation

| Path | Who | What |
| --- | --- | --- |
| `/` | Signed-out visitors | Landing page. Signed-in people are sent straight to their home (next row) |
| `/auth/sign-in`, `/auth/sign-up` | Anyone | Redirect to the WorkOS hosted sign-in / sign-up page; `?returnTo=/path&email=hint` supported |
| `/auth/callback` | — | WorkOS returns here, then `/` routes the user |
| `/login` | Signed-out | Simple sign-in page (sign-out also lands here) |
| `/superadmin` | Superadmins | Invite organizations, see all organizations |
| `/invite/<token>` | Invited admins | Accept an organization invitation and set it up |
| `/onboarding` | Signed in, no organization yet | Profile → request to join → wait for approval |
| `/dashboard` | Approved members | Home of the app; also `/incidents`, `/incidents/new`, `/analytics`, `/organizations`, `/settings` |
| `/admin/members` | Organization admins | Approve requests, change roles, remove members |
| `/admin/organization` | Organization admins | Edit the organization's name and profile |
| `/switch-org?org=…&next=…` | Members | Switch the working organization (used by the header switcher and emails) |
| `/go/incident/<id>` | Members | Open an incident from an email, switching to its organization first |

**Where people land after signing in:** superadmin → `/superadmin`; member of at least one organization → `/dashboard`; everyone else → `/onboarding`. Any other page asked for while signed out redirects to sign-in, and API routes answer 401.

## Authentication & organizations

Sign-in is [WorkOS AuthKit](https://workos.com/docs/user-management) (hosted login: email/password, Google, SSO, etc.). The app keeps its own `User`, `Organization`, `Membership` and `OrgInvitation` tables; WorkOS only proves who someone is.

| Role | Who | Frontend | Can |
| --- | --- | --- | --- |
| **Superadmin** | Emails in `SUPERADMIN_EMAILS` | `/superadmin` | Invite organizations by email, resend/revoke invites, see all organizations |
| **Admin** | Whoever accepts an org invitation | App + `/admin/members` | Approve/decline join requests, change member roles, remove members, plus everything a user can do |
| **User** | Anyone who signs up | `/onboarding` → app | Fill in profile, request to join one or more organizations; once approved, use the app with the role each admin gave them (viewer / reporter / QA verifier / admin) |

Flows:

1. **Organization invite.** A superadmin enters an organization name and the admin's email. The admin gets a one-time link (`/invite/<token>`, valid 7 days, only its SHA-256 is stored). They sign up **with that email**, fill in their details and the organization's (industry, size, website, description), and become its admin. Without `RESEND_API_KEY`, the console shows the link so you can share it yourself.
2. **Joining.** A new user signs up, fills in name / job title / department / phone / bio, searches for their organization and sends a request (with an optional note). The org admins are emailed. The pending page updates on its own when the request is approved.
3. **Routing.** After sign-in everyone lands on the right page: superadmins → `/superadmin`, approved members → the app, everyone else → `/onboarding`. API routes need an approved member (or superadmin) unless they are onboarding endpoints.
4. **Several organizations per person.** Someone can belong to their employer, freelance clients and side projects at once, with a different role in each. The header switcher (or `/organizations`) changes the organization they work in; the choice is kept in a cookie and links in emails switch automatically (`/switch-org`, `/go/incident/:id`). People can leave an organization themselves, except its last admin.

**Organizations are never deleted.** From `/superadmin` → *Manage*, a superadmin can edit an organization's details or **suspend** it, giving a reason and typing its name to confirm. While suspended:
- Members can't open it or switch to it.
- It's hidden from the join list, and join requests are refused.
- Its incidents send no emails.
- Its admins are emailed the reason.

*Reactivate* restores everything exactly as it was. The database enforces the never-delete rule: incidents reference their organization with `ON DELETE RESTRICT`.

**Data separation.** Every incident belongs to the organization it was reported in. Lists, search, matching, analytics, comments, @mentions, notifications and exports only ever see the current organization (`requireOrg()` + `inOrg()` / `orgSql()` in `lib/api.ts`). Incidents created before organizations existed belong to none and are hidden until you run `npm run incidents:assign -- <organization-slug>`.

**WorkOS setup** (dashboard.workos.com, use the *Staging* environment locally):

1. *API Keys* → copy `WORKOS_API_KEY` and `WORKOS_CLIENT_ID` into `.env`.
2. *Redirects* → add `http://localhost:3000/auth/callback` as a Redirect URI (`WORKOS_REDIRECT_URI`), and `http://localhost:3000/login` as the Sign-out redirect.
3. Generate `WORKOS_COOKIE_PASSWORD` with `openssl rand -base64 32`.
4. Keep *email verification* on (the default). Accepting an invitation requires a verified email that matches the invite.

## Features

- **Report → match → decide.** A guided form (PRD §6.1 limits, live validation). On submit, the incident is saved and compared against the organization's history by keywords (Postgres full-text) **and by meaning** (embeddings + pgvector, when an embeddings key is set), so a paraphrase with no shared words still matches. Matches found by meaning are labelled *Similar meaning*. You then choose: *Yes, same issue* (link + notify the original owner), *Similar, different approach*, or *Different issue*.
- **Recurrence chains.** "Same issue" links group under the first occurrence; its `recurringCount` drives the "keeps coming back" lists.
- **Multiple solutions per incident.** Each has a root cause, approach, time to fix, kind of fix, when to use it, prevention and monitoring notes, and a 5-point QA checklist. QA verifiers sign them off. When a recurrence reuses a fix, the reporter records whether it worked, which feeds per-solution effectiveness (reuse count, success rate, MTTR saved).
- **Collaboration.** Threaded comments with `@mention` autocomplete, in-app notification inbox and email via Resend. P1 incidents can escalate to an on-call address.
- **Audit trail.** Every create, status, severity, link, solution, verification and comment is written to an activity log. Deletes are soft deletes.
- **Search & browse.** Prefix full-text search, filters (status, severity, systems, department, date range, recurrence), sorting, pagination.
- **Export.** The current list as CSV (up to 5,000 rows) or a PDF report with summary tiles (up to 1,000 rows), downloaded or emailed to yourself with both attached.
- **Analytics.** KPIs (incidents this month, average MTTR, recurring rate, resolution rate), MTTR and daily-volume trends (7/30/90 days), severity/status/system breakdowns, top recurring incidents, department contribution, top solvers and a department × system heatmap. Every chart has a table view.
- **Light and dark themes,** keyboard navigable, labelled controls, and status never conveyed by colour alone.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run type-check` | `tsc --noEmit` (strict, `noUncheckedIndexedAccess`) |
| `npm run lint` | ESLint, zero warnings allowed, `any` is an error |
| `npm test` | Vitest: unit, component and API integration tests (needs Postgres, see below) |
| `npm run test:e2e` | Playwright critical-flow tests |
| `npm run db:up` | Start local Postgres (Docker) |
| `npm run db:migrate` | Create a new migration in development |
| `npm run db:deploy` | Apply migrations (`prisma migrate deploy`) |
| `npm run db:seed` | Seed demo data (`-- --reset` wipes first, local DBs only; `-- --scale 100000` adds synthetic rows) |
| `npm run incidents:assign -- <slug>` | Move incidents that belong to no organization (older data, seed data) into one |
| `npm run embeddings:backfill` | Embed incidents that have no embedding yet, so meaning-based matching covers them |
| `npx tsx scripts/bench.ts` | Query latency benchmark against the current `DATABASE_URL` |

## Testing

```bash
npm run db:up                    # tests use the incident_tracker_test database on the same server
docker compose exec db psql -U postgres -c "CREATE DATABASE incident_tracker_test"   # first time only
npm test
```

Integration tests call the route handlers directly against a real Postgres (migrations are applied automatically). `TEST_DATABASE_URL` overrides the default.

**Identity in tests.** Route handlers trust `x-user-*` headers only when `NODE_ENV=test`; add `x-test-organization` (the `org` field of a `TestUser`) to work inside an organization. `member(org, person, role)` in `__tests__/setup/helpers.ts` creates the user, the membership and that identity in one step. Routes that read the WorkOS session (memberships, invitations, organizations, switching) are tested by mocking only `getSession`, as in `organizations.api.test.ts`.

**Tenant isolation** is covered by `tenancy.api.test.ts`: every incident route is called from one organization against another's data. If you add a route that touches incidents, add it there. `mentions.api.test.ts` checks that incident emails only reach members.

`__tests__/integration/matching.eval.test.ts` is a labelled evaluation of the similar-incident matcher. It asserts a false-positive rate under 5% and recall@1 of at least 80%. Re-run it after changing anything in `lib/search.ts`.

E2E: `npm run test:e2e` starts the dev server on port 3100 (or set `E2E_BASE_URL` to test a running instance). Run `npx playwright install chromium` once.

## Configuration

See [.env.example](.env.example). Required: `DATABASE_URL`, `DIRECT_URL`. Optional: `RESEND_API_KEY` + `EMAIL_FROM` (without them, notifications are in-app only), `ONCALL_EMAIL`, `APP_URL` (links in emails), `RATE_LIMIT_PER_MINUTE` (default 100), `LOG_LEVEL=debug`.

## Project layout

```
app/
  (app)/            pages: dashboard, incidents (list, new, [id]), analytics, settings
  api/              route handlers (see docs/API.md)
components/
  ui/               shadcn-style primitives (Radix): button, input, select, dialog, tabs, …
  IncidentForm, MatchResults, MatchDecision, IncidentDetail, IncidentList, PatternsTab, …
hooks/              SWR data hooks (useIncidents.ts) and the fetch client (api.ts)
lib/
  validators.ts     Zod schemas — single source of truth for API + forms
  search.ts         full-text list/search and similar-incident matching
  stats.ts          analytics queries
  api.ts            route wrapper, error handling, auth guard
  auth.ts           resolves the API caller (Actor) from the WorkOS session
  session.ts        WorkOS session → app user + membership; page guards (requireMember, requireOrgAdmin, …)
  organizations.ts  invitation tokens, API guards for superadmin / org admin
  email.ts          notifications (in-app + Resend)
  store.ts          Zustand stores (user, UI, search)
prisma/             schema, migrations, seed
__tests__/          unit, component and integration tests
e2e/                Playwright specs
```

## Deployment

- **Vercel:** set the env vars and use Supabase/RDS for Postgres (pooled `DATABASE_URL`, direct `DIRECT_URL`). CI runs `prisma migrate deploy` and deploys on `main` when `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` and `DIRECT_URL` secrets exist.
- **Docker:** `docker compose --profile app up --build` runs Postgres + the app. For your own infra, build the image (`Dockerfile`, standalone output, non-root, health check) and run the `migrate` target before each release.

Details, including **upgrading an existing Supabase database created by the earlier version of this app**, are in [docs/RUNBOOK.md](docs/RUNBOOK.md).

## Known limitations

- **Semantic thresholds are uncalibrated.** `SEMANTIC_BOUNDS` in `lib/search.ts` were set from typical cosine ranges, not measured on your data. Run the matching eval with an embeddings key and adjust them if matches by meaning are too loose or too strict.
- **PDF uses the standard PDF fonts**, so characters outside Latin-1 (e.g. CJK names) are not rendered in the PDF. The CSV keeps them.
- **Rate limiting is per server instance** (in-memory). Use a shared store (e.g. Upstash Redis) for multi-instance deployments.
- **Slack/webhook integrations** from the PRD are not implemented.
- **Without an embeddings key, matching is keyword-only**: paraphrases with no shared vocabulary will not match.
