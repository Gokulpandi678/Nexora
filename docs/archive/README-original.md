# Enterprise Incident Tracker

**A sophisticated, organization-wide incident management system that prevents recurring issues through intelligent knowledge management and pattern recognition.**

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Status](https://img.shields.io/badge/status-production%20ready-brightgreen.svg)]()
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org)
[![PostgreSQL](https://img.shields.io/badge/postgres-%3E%3D14-blue.svg)](https://www.postgresql.org)

---

## Table of Contents

- [Quick Start](#quick-start)
- [Features](#features)
- [Architecture](#architecture)
- [Installation](#installation)
- [Configuration](#configuration)
- [Database Setup](#database-setup)
- [Deployment](#deployment)
- [API Documentation](#api-documentation)
- [Usage Guide](#usage-guide)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)

---

## Quick Start

### Prerequisites
- **Node.js**: v18+ ([download](https://nodejs.org))
- **PostgreSQL**: v14+ (local or Supabase)
- **npm**: v9+
- **Git**: v2.25+

### 5-Minute Setup

```bash
# 1. Clone repository
git clone https://github.com/yourorg/incident-tracker.git
cd incident-tracker

# 2. Install dependencies
npm install

# 3. Create .env.local (see Configuration section)
cp .env.example .env.local
# Edit .env.local with your database credentials

# 4. Setup database
npx prisma migrate deploy

# 5. Seed sample data (optional)
npm run db:seed

# 6. Start development server
npm run dev

# 7. Open http://localhost:3000
```

**That's it!** The app is running locally.

---

## Features

### 🎯 Core Capabilities

#### 1. **Intelligent Incident Reporting**
- Rich, structured incident submission form
- Multi-select system/component tagging
- Severity classification (P1 → P4)
- Automatic timestamp & duration tracking
- Markdown support for descriptions

#### 2. **Smart Matching Engine (RAG)**
- Full-text search on 10k+ incidents in <500ms
- Semantic matching:
  - 2+ shared keywords OR
  - 1 keyword + shared affected system
- Similarity scoring and ranking
- Prevents false matches on incidental words

#### 3. **Decision-Based Workflow**
- User chooses: "Yes, same issue" / "No, different" / "Similar, different approach"
- Not forced to use past solutions
- Multiple approaches stored for same problem
- Original solver notified when issue recurs

#### 4. **Multi-Solution Storage**
- Store multiple proven approaches per incident
- Includes: root cause, steps, efficiency, QA status
- Inherit solutions from linked incidents
- Track which approach was actually used

#### 5. **QA & Verification**
- 5-point QA checklist per solution:
  - Root cause confirmed
  - Fix verified in test env
  - Monitoring added
  - Rollback plan documented
  - Solution documented
- Verified vs. unverified tracking
- Prevention rules stored

#### 6. **Analytics Dashboard**
- **KPIs**: MTTR, recurring rate, resolution rate
- **Charts**: By severity, by system, by department
- **Trends**: Historical comparison
- **Heatmaps**: Identify systemic weak points
- **Top recurring**: Most-repeated incidents
- **Predictive**: ML-based insights (v2.0+)

#### 7. **Collaboration**
- Email notifications to original solvers
- Per-incident comment threads
- Activity log / audit trail
- @Mentions for team members
- Department/team assignment

#### 8. **Export & Integration**
- PDF report generation
- CSV export for BI tools
- Slack notifications (v1.2+)
- Webhook support (v1.3+)
- API for external tools

---

## Architecture

### System Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        USER LAYER                           │
│  Web UI (React) | Mobile App (iOS/Android future) | API    │
└──────────────────────────────────────────────────────────────┘
                             │
┌──────────────────────────────────────────────────────────────┐
│                   APPLICATION LAYER                          │
│  Next.js 15+ App Router | API Routes | Type Safety (TS)    │
└──────────────────────────────────────────────────────────────┘
                             │
┌──────────────────────────────────────────────────────────────┐
│                    BUSINESS LOGIC LAYER                       │
│  ┌─────────────┐ ┌──────────────┐ ┌──────────────┐         │
│  │Search/Match │ │ Verification │ │  Analytics  │         │
│  │   Engine    │ │   Workflow   │ │   Engine    │         │
│  └─────────────┘ └──────────────┘ └──────────────┘         │
└──────────────────────────────────────────────────────────────┘
                             │
┌──────────────────────────────────────────────────────────────┐
│                    DATA ACCESS LAYER                          │
│   Prisma ORM | Type-safe DB queries | Connection pooling    │
└──────────────────────────────────────────────────────────────┘
                             │
┌──────────────────────────────────────────────────────────────┐
│                     DATABASE LAYER                            │
│  PostgreSQL 14+ | Full-text search | JSON support          │
│  (Supabase managed or self-hosted)                          │
└──────────────────────────────────────────────────────────────┘
```

### Technology Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Frontend** | Next.js 15, React 18, TailwindCSS | Modern, fast, great DX |
| **State Mgmt** | Zustand, SWR | Lightweight, performant |
| **Backend** | Next.js API Routes | Unified codebase, serverless-ready |
| **Database** | PostgreSQL 14+ | Robust, full-text search, proven at scale |
| **ORM** | Prisma 6 | Type-safe, migrations, excellent developer experience |
| **Hosting** | Vercel (frontend), AWS Lambda/Vercel (backend) | Fast, scalable, low ops |
| **Email** | Resend or SendGrid | Reliable, good templates |
| **Auth** | NextAuth.js (v2.0+) | SSO-ready, secure |

---

## Installation

### Step 1: Clone Repository

```bash
git clone https://github.com/yourorg/incident-tracker.git
cd incident-tracker
git checkout main  # or latest stable branch
```

### Step 2: Install Dependencies

```bash
# Install all dependencies
npm install

# Verify installation
npm run type-check
```

### Step 3: Environment Setup

```bash
# Copy example env file
cp .env.example .env.local

# Edit with your values
nano .env.local
```

See [Configuration](#configuration) section for all required variables.

### Step 4: Database Initialization

```bash
# Run migrations
npx prisma migrate deploy

# Generate Prisma client
npx prisma generate

# (Optional) Seed with sample data
npm run db:seed
```

### Step 5: Verify Setup

```bash
# Type check
npm run type-check

# Lint
npm run lint

# Start dev server
npm run dev
```

Open **http://localhost:3000** in your browser.

---

## Configuration

### Environment Variables

Create `.env.local` with these variables:

```bash
# ============ DATABASE ============
# Use pooled connection (6543) for app, direct (5432) for migrations
DATABASE_URL="postgresql://postgres:[PASSWORD]@[HOST]:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres"

# ============ SUPABASE (if using) ============
SUPABASE_URL="https://[PROJECT-ID].supabase.co"
SUPABASE_ANON_KEY="[YOUR-ANON-KEY]"

# ============ EMAIL ============
RESEND_API_KEY="re_[YOUR-KEY]"
EMAIL_FROM="Incident Tracker <alerts@yourcompany.com>"

# ============ APPLICATION ============
APP_URL="http://localhost:3000"  # or production domain
NODE_ENV="development"  # development | production

# ============ AUTHENTICATION (v2.0+) ============
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="[GENERATE-WITH: openssl rand -base64 32]"
GITHUB_ID="[OPTIONAL-FOR-DEV]"
GITHUB_SECRET="[OPTIONAL-FOR-DEV]"

# ============ MONITORING (optional) ============
SENTRY_DSN="[OPTIONAL-FOR-ERROR-TRACKING]"
DATADOG_API_KEY="[OPTIONAL-FOR-APM]"
```

### Database Connection Strings

**Getting Supabase Connection String:**

1. Go to **Supabase Dashboard** → Your Project
2. Click **Settings** → **Database** → **Connection string**
3. Copy **Pooled** (port 6543) → `DATABASE_URL`
4. Copy **Direct** (port 5432) → `DIRECT_URL`
5. Replace `[password]` with your database password

**Example (Supabase):**
```
DATABASE_URL="postgresql://postgres:mypassword@db.oqmizcmvkgjbefagdxws.supabase.co:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres:mypassword@db.oqmizcmvkgjbefagdxws.supabase.co:5432/postgres"
```

**For Self-Hosted PostgreSQL:**
```
DATABASE_URL="postgresql://postgres:password@localhost:5432/incident_tracker"
DIRECT_URL="postgresql://postgres:password@localhost:5432/incident_tracker"
```

### Generating Secrets

```bash
# Generate NEXTAUTH_SECRET
openssl rand -base64 32

# Generate JWT secret (if using custom auth)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Database Setup

### Option A: Supabase (Recommended for Startups)

1. **Create Supabase Account** (free tier available)
   - Go to https://supabase.com
   - Sign up with GitHub/Google/Email
   - Create new project (takes ~2 min)

2. **Get Connection String**
   - Project Settings → Database → Connection string
   - Copy Pooled & Direct URLs

3. **Update .env.local**
   ```bash
   DATABASE_URL="postgresql://postgres:[PASSWORD]@[HOST]:6543/postgres?pgbouncer=true"
   DIRECT_URL="postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres"
   ```

4. **Run Migrations**
   ```bash
   npx prisma migrate deploy
   ```

5. **Verify**
   - Go to Supabase Dashboard → SQL Editor
   - Run: `SELECT table_name FROM information_schema.tables WHERE table_schema='public';`
   - Should see: Incident, Solution, MatchLink, NotificationLog

### Option B: Self-Hosted PostgreSQL

1. **Install PostgreSQL**
   ```bash
   # Ubuntu/Debian
   sudo apt-get install postgresql-14

   # macOS (Homebrew)
   brew install postgresql@14

   # Windows: Download from https://www.postgresql.org/download/windows/
   ```

2. **Create Database**
   ```bash
   psql -U postgres
   CREATE DATABASE incident_tracker;
   \q
   ```

3. **Update .env.local**
   ```bash
   DATABASE_URL="postgresql://postgres:password@localhost:5432/incident_tracker"
   DIRECT_URL="postgresql://postgres:password@localhost:5432/incident_tracker"
   ```

4. **Run Migrations**
   ```bash
   npx prisma migrate deploy
   ```

### Migrations

```bash
# Apply pending migrations
npx prisma migrate deploy

# Create new migration
npx prisma migrate dev --name add_new_field

# Reset database (development only!)
npx prisma migrate reset

# View migration status
npx prisma migrate status
```

---

## Deployment

### Deploy to Vercel (Recommended)

**Step 1: Push to GitHub**

```bash
git add .
git commit -m "Ready for production"
git push origin main
```

**Step 2: Connect to Vercel**

1. Go to https://vercel.com/new
2. Import your GitHub repository
3. Select "Next.js" as framework
4. Click "Deploy"

**Step 3: Add Environment Variables**

In Vercel Dashboard:
1. Project Settings → Environment Variables
2. Add all variables from `.env.local`:
   - `DATABASE_URL`
   - `DIRECT_URL`
   - `NEXTAUTH_SECRET`
   - `RESEND_API_KEY`
   - etc.

**Step 4: Run Database Migrations**

```bash
# In Vercel CLI
vercel env pull

# Then run migrations
npx prisma migrate deploy
```

**Step 5: Redeploy**

```bash
git push origin main  # Vercel auto-deploys
```

Your app is now live at `https://[your-project].vercel.app`

### Deploy to AWS (Self-Hosted)

```bash
# 1. Build Docker image
docker build -t incident-tracker:latest .

# 2. Push to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin [ACCOUNT_ID].dkr.ecr.us-east-1.amazonaws.com
docker tag incident-tracker:latest [ACCOUNT_ID].dkr.ecr.us-east-1.amazonaws.com/incident-tracker:latest
docker push [ACCOUNT_ID].dkr.ecr.us-east-1.amazonaws.com/incident-tracker:latest

# 3. Deploy to ECS/Lambda with CloudFormation or Terraform
terraform apply -var="image_uri=..." -var="db_url=..."
```

### Monitor Deployment

```bash
# View Vercel logs
vercel logs --follow

# View production metrics
npm run build  # Verify build succeeds

# Health check
curl https://[your-domain]/api/health
```

---

## API Documentation

### Base URL
```
Development:  http://localhost:3000/api
Production:   https://[your-domain]/api
```

### Authentication (v1.0+)
```
Header: Authorization: Bearer [JWT_TOKEN]
```

### Endpoints

#### Create Incident
```
POST /incidents/create

Body: {
  title: "Database connection timeout",
  description: "Cannot connect to production DB...",
  symptoms: "API returning 500 errors...",
  affectedSystems: ["Database", "API"],
  severity: "P1",
  createdBy: "John Doe",
  email: "john@company.com"
}

Response: {
  incident: { id, title, ... },
  similarIncidents: [...]
}
```

#### Link Incidents
```
POST /incidents/:id/link

Body: {
  originalIncidentId: "cuid123",
  matchType: "SAME",  // or "SIMILAR"
  solutionUsed: "Approach A",
  notes: "Exact same symptoms"
}

Response: { success: true, linkedAt: "2026-10-07T10:00:00Z" }
```

#### Search Incidents
```
GET /incidents/search?q=database&status=OPEN&severity=P1

Response: {
  incidents: [{...}, {...}],
  total: 42,
  hasMore: true
}
```

#### Get Analytics
```
GET /stats/dashboard

Response: {
  totalIncidents: 1024,
  avgMTTR: 1800,  // seconds
  recurringRate: 0.35,  // 35%
  byStatus: { OPEN: 12, RESOLVED: 892, CLOSED: 120 },
  bySystem: { "Database": 234, "API": 189, ... }
}
```

#### Full API Reference
See [`docs/API.md`](docs/API.md) for complete endpoint documentation.

---

## Usage Guide

### For Incident Reporters

**1. Report an Incident**
- Click "Report Incident" button
- Fill form: title, description, symptoms, affected systems, severity
- Click "Submit"

**2. See Similar Incidents**
- System shows top 5 similar past incidents
- Read descriptions to find matches
- Click "Yes, this is my issue" if match found

**3. Linking Decision**
- If yes: system links incidents + notifies original solver
- If no: create as new incident

**4. Add a Solution**
- Once incident resolved, click "Add Solution"
- Fill: root cause, approach, time to fix, QA checklist
- Submit
- Mark as "Verified" once QA approves

### For QA/Verification

**1. Verify Solutions**
- Go to Incident Detail page
- Review solution details
- Check 5-point QA checklist:
  - ☐ Root cause confirmed
  - ☐ Fix verified in staging
  - ☐ Monitoring added
  - ☐ Rollback plan documented
  - ☐ Solution documented
- Click "Verify Solution"

**2. Track Prevention**
- Add prevention rules: "What prevents recurrence?"
- Update monitoring field with alert thresholds
- Document if this incident pattern recurs too frequently

### For Management/Analytics

**1. View Dashboard**
- Go to "Patterns" tab
- See key metrics: MTTR, recurring rate, resolution time
- Identify systemic issues (high-incident systems)

**2. Generate Reports**
- Click "Export" button
- Choose: PDF (formal report) or CSV (BI import)
- Reports include: metrics, trends, top recurring incidents

**3. Track Team Performance**
- Analytics → "Teams" tab
- See contribution metrics per team
- Identify expertise areas

---

## Troubleshooting

### Common Issues

#### "Table does not exist" Error

**Cause**: Migrations not applied  
**Fix**:
```bash
npx prisma migrate deploy
npx prisma db pull  # Verify tables exist
npm run dev
```

#### "Can't reach database server" Error

**Cause**: Connection string wrong or DB offline  
**Fix**:
```bash
# Verify connection string
cat .env.local | grep DATABASE_URL

# Test connection
psql "postgresql://..."

# If using Supabase, check it's not paused
# https://supabase.com/dashboard → Your Project
```

#### "PrismaClientKnownRequestError" at Runtime

**Cause**: Prisma client not regenerated after schema change  
**Fix**:
```bash
npx prisma generate
npm run dev
```

#### Slow Search Queries

**Cause**: Full-text index not created  
**Fix**:
```bash
npx prisma db execute --stdin << EOF
CREATE INDEX IF NOT EXISTS "Incident_fts_idx" ON "Incident" USING GIN (
  to_tsvector('english', coalesce("title", '') || ' ' || coalesce("description", '') || ' ' || coalesce("symptoms", ''))
);
EOF
```

#### Email Not Sending

**Cause**: RESEND_API_KEY missing or invalid  
**Fix**:
```bash
# Get key from https://resend.com
# Update .env.local
RESEND_API_KEY="re_xxxxx"

# Restart dev server
npm run dev
```

#### See More Issues
Check [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md)

---

## Development

### Local Development

```bash
# Start dev server
npm run dev

# In another terminal, watch for changes
npm run dev:watch

# Type check
npm run type-check

# Lint & format
npm run lint
npm run format
```

### Testing

```bash
# Run all tests
npm run test

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage
```

### Database Management

```bash
# Open Prisma Studio (GUI)
npx prisma studio

# View schema
npx prisma db pull

# Create migration from changes
npx prisma migrate dev --name describe_change
```

### Debugging

```bash
# Enable verbose logging
DEBUG=* npm run dev

# Use Chrome DevTools
node --inspect-brk ./node_modules/.bin/next dev

# View database logs
# Supabase Dashboard → Logs → Database
```

---

## Performance Optimization

### Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Enable database connection pooling (PgBouncer)
- [ ] Configure Vercel caching headers
- [ ] Enable Sentry for error tracking
- [ ] Setup monitoring (Datadog/NewRelic)
- [ ] Configure CDN for static assets
- [ ] Enable Redis caching (optional)
- [ ] Setup log aggregation (Papertrail/Loggly)
- [ ] Create database backups
- [ ] Setup uptime monitoring

### Optimization Tips

```javascript
// 1. Use SWR for API calls
import useSWR from 'swr'
const { data } = useSWR('/api/incidents', fetcher)

// 2. Paginate large lists
const [page, setPage] = useState(1)
GET /api/incidents?page=1&limit=20

// 3. Index frequently queried fields
// In prisma/schema.prisma:
@@index([status, severity, createdAt])

// 4. Cache search results
GET /api/incidents/search?q=...
// Cached for 1 minute

// 5. Use compression
// Vercel enables gzip/brotli automatically
```

---

## Contributing

### Report Issues
- GitHub Issues: https://github.com/yourorg/incident-tracker/issues
- Include: error message, steps to reproduce, expected behavior

### Contribute Code
1. Fork repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push: `git push origin feature/amazing-feature`
5. Create Pull Request

### Code Style
- Follow ESLint config (run `npm run lint`)
- Use TypeScript (no `any` types)
- Write tests for new features
- Update docs

---

## Security

### Vulnerability Reporting
**Do not** open public issues for security vulnerabilities.  
Email: security@yourcompany.com

### Security Features
- ✅ Input validation on all API endpoints
- ✅ SQL injection protection (Prisma ORM)
- ✅ CSRF protection (Next.js)
- ✅ Rate limiting (100 req/min per user)
- ✅ Audit logging (who did what, when)
- ✅ TLS 1.3 encryption in transit
- ✅ AES-256 encryption at rest (Supabase)
- ✅ Role-based access control (v1.1+)

---

## Support

### Documentation
- **Getting Started**: [`docs/GETTING_STARTED.md`](docs/GETTING_STARTED.md)
- **Architecture**: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- **API Reference**: [`docs/API.md`](docs/API.md)
- **Troubleshooting**: [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md)

### Community
- GitHub Discussions: https://github.com/yourorg/incident-tracker/discussions
- Slack Community: #incident-tracker (if you have a Slack workspace)

### Contact
- Email: support@yourcompany.com
- Twitter: @yourcompany
- Website: https://yourcompany.com

---

## License

This project is licensed under the MIT License - see [`LICENSE`](LICENSE) file for details.

---

## Roadmap

### v1.0 (Current - Q4 2026)
- ✅ Core incident reporting
- ✅ Smart matching
- ✅ Multi-solution storage
- ✅ Basic analytics
- ✅ Email notifications

### v1.1 (Q1 2027)
- 🔄 Role-based access control
- 🔄 Advanced filtering
- 🔄 Export to PDF/CSV
- 🔄 Slack integration

### v1.2 (Q2 2027)
- 📋 Webhook support
- 📋 API authentication
- 📋 Mobile app (iOS/Android)
- 📋 Advanced search (filters, saved queries)

### v2.0 (Q3 2027)
- 🔮 ML-based pattern detection
- 🔮 Predictive incident forecasting
- 🔮 Automated incident categorization
- 🔮 Advanced RBAC & workflows
- 🔮 SSO/SAML integration

---

**Made with ❤️ by the Infrastructure Team**

---

## Changelog

### v1.0.0 (October 7, 2026)
- Initial release
- Core incident tracking
- Full-text search
- Email notifications
- Dashboard analytics

[See full changelog](CHANGELOG.md)
