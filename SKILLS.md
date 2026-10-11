# Development Skills Guide: Enterprise Incident Tracker

**Custom development workflows, checklists, and best practices for building this enterprise application.**

---

## Skill 1: Feature Implementation Checklist

**When building a new feature, follow this checklist to ensure quality.**

### A. Planning Phase
- [ ] Write clear user story (who, what, why)
- [ ] Define success criteria (how to verify it works)
- [ ] Identify affected databases/APIs
- [ ] Sketch UI/UX flow
- [ ] List edge cases to handle
- [ ] Check for security implications

**Example User Story:**
```
As a: Incident Reporter
I want to: See 5 most similar past incidents when reporting
So that: I can reuse existing solutions instead of solving the same problem twice

Success Criteria:
- Search happens automatically when form submitted
- Results show within 500ms
- At least 80% of matched incidents are actually similar (manual QA)
- User can easily decide Yes/No/Different Approach
```

### B. Database Phase
- [ ] Update Prisma schema (if needed)
- [ ] Create/update migrations
- [ ] Add necessary indexes for performance
- [ ] Test queries with large datasets (>10k records)
- [ ] Verify cascade deletes don't break data
- [ ] Document any new relationships

**Commands:**
```bash
npx prisma migrate dev --name add_feature_name
npx prisma db push  # Verify changes applied
npx prisma studio  # Visual inspection
```

### C. API Implementation Phase
- [ ] Define endpoint (method, path, params)
- [ ] Create Zod validation schema
- [ ] Implement route handler
- [ ] Add error handling & logging
- [ ] Test with Postman/curl
- [ ] Check response times (<200ms)
- [ ] Add rate limiting if needed

**Template:**
```typescript
// app/api/feature/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const requestSchema = z.object({
  // Define shape
})

export async function POST(req: NextRequest) {
  try {
    const data = requestSchema.parse(await req.json())
    const result = await db.model.create({ data })
    return NextResponse.json(result)
  } catch (error) {
    logError(error, { endpoint: '/api/feature' })
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
```

### D. Frontend Component Phase
- [ ] Create component file (components/FeatureName.tsx)
- [ ] Build UI with Shadcn components
- [ ] Wire up data fetching (SWR hook)
- [ ] Add form validation
- [ ] Handle loading/error states
- [ ] Test on mobile (<500px width)
- [ ] Check accessibility (keyboard nav, ARIA)

**Template:**
```typescript
'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Button } from '@/components/ui/button'

interface FeatureProps {
  data?: any
}

export default function FeatureName({ data }: FeatureProps) {
  const [loading, setLoading] = useState(false)
  const { data: results } = useSWR('/api/feature', fetcher)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const response = await fetch('/api/feature', {
        method: 'POST',
        body: JSON.stringify({}),
      })
      if (!response.ok) throw new Error('Failed')
      const result = await response.json()
      // Update UI
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      {/* Component JSX */}
    </div>
  )
}
```

### E. Testing Phase
- [ ] Write unit tests for API route
- [ ] Write unit tests for utility functions
- [ ] Write E2E test for user flow
- [ ] Test error cases
- [ ] Test with various inputs
- [ ] Performance test (load test if applicable)

**Test Template:**
```typescript
describe('Feature: Incident Matching', () => {
  it('should return similar incidents', async () => {
    const response = await fetch('/api/incidents/search', {
      method: 'POST',
      body: JSON.stringify({ query: 'database timeout' })
    })
    expect(response.ok).toBe(true)
    const data = await response.json()
    expect(data.results).toHaveLength(5)
  })

  it('should handle empty query gracefully', async () => {
    const response = await fetch('/api/incidents/search', {
      method: 'POST',
      body: JSON.stringify({ query: '' })
    })
    expect(response.status).toBe(400)
  })
})
```

### F. Documentation Phase
- [ ] Update README if user-facing
- [ ] Document API endpoint (params, response)
- [ ] Add code comments for complex logic
- [ ] Update CHANGELOG
- [ ] Create examples in docs/

**API Documentation Template:**
```markdown
### POST /api/feature

Creates/retrieves feature data.

**Request:**
```json
{
  "param1": "string",
  "param2": 123
}
```

**Response (200):**
```json
{
  "id": "...",
  "result": "..."
}
```

**Error Responses:**
- 400: Invalid input
- 500: Server error
```

### G. Code Review Checklist
- [ ] TypeScript: No `any` types, all errors fixed
- [ ] Security: All inputs validated, no SQL injection risk
- [ ] Performance: API <200ms, DB queries optimized
- [ ] Accessibility: Keyboard navigation works, ARIA labels present
- [ ] Tests: All pass, coverage >80%
- [ ] Docs: Updated and clear
- [ ] Style: Follows project conventions

---

## Skill 2: API Development Workflow

**Best practices for building robust API endpoints.**

### Step 1: Design the Contract

Before coding, define:
```typescript
// Request shape
interface CreateIncidentRequest {
  title: string          // 50-255 chars
  description: string    // 100-5000 chars
  symptoms: string       // 50-2000 chars
  affectedSystems: string[]
  severity: 'P1' | 'P2' | 'P3' | 'P4'
  email: string
}

// Response shape
interface CreateIncidentResponse {
  incident: {
    id: string
    title: string
    createdAt: string
  }
  similarIncidents: Array<{
    id: string
    title: string
    similarity: number  // 0-1
  }>
}

// Error shape
interface ErrorResponse {
  error: string
  code: string
  details?: Record<string, string>
}
```

### Step 2: Create Validation Schema

```typescript
import { z } from 'zod'

export const createIncidentSchema = z.object({
  title: z.string()
    .min(50, 'Title must be at least 50 characters')
    .max(255, 'Title must be at most 255 characters'),
  description: z.string()
    .min(100, 'Description must be at least 100 characters')
    .max(5000, 'Description must be at most 5000 characters'),
  symptoms: z.string()
    .min(50, 'Symptoms must be at least 50 characters'),
  affectedSystems: z.array(z.string()).min(1),
  severity: z.enum(['P1', 'P2', 'P3', 'P4']),
  email: z.string().email(),
})
```

### Step 3: Implement Route Handler

```typescript
export async function POST(req: NextRequest) {
  // 1. Parse & validate input
  let data: unknown
  try {
    data = await req.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON' },
      { status: 400 }
    )
  }

  // 2. Validate against schema
  const validation = createIncidentSchema.safeParse(data)
  if (!validation.success) {
    return NextResponse.json(
      { 
        error: 'Validation failed',
        details: validation.error.flatten()
      },
      { status: 400 }
    )
  }

  // 3. Execute business logic
  try {
    const incident = await db.incident.create({
      data: validation.data
    })
    
    const similar = await searchSimilar(validation.data.title)
    
    return NextResponse.json({
      incident,
      similarIncidents: similar
    })
  } catch (error) {
    logError(error, { endpoint: 'POST /api/incidents' })
    return NextResponse.json(
      { error: 'Failed to create incident' },
      { status: 500 }
    )
  }
}
```

### Step 4: Error Handling Pattern

```typescript
// lib/errors.ts
export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string
  ) {
    super(message)
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(400, message, 'VALIDATION_ERROR')
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(404, message, 'NOT_FOUND')
  }
}

// Usage in routes:
try {
  if (!data) throw new NotFoundError('Incident not found')
} catch (error) {
  if (error instanceof AppError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.statusCode }
    )
  }
  // Unknown error
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
}
```

### Step 5: Performance Optimization

```typescript
// Cache frequently accessed data
const cachedStats = new Map<string, any>()
const CACHE_TTL = 60000  // 1 minute

async function getStats(key: string) {
  if (cachedStats.has(key)) {
    return cachedStats.get(key)
  }
  
  const stats = await expensiveCalculation()
  cachedStats.set(key, stats)
  setTimeout(() => cachedStats.delete(key), CACHE_TTL)
  return stats
}

// Use database indexes for search
// In Prisma schema:
@@index([status, severity, createdAt])

// Query efficiently with Prisma
const incidents = await db.incident.findMany({
  where: {
    status: 'OPEN',
    severity: 'P1'
  },
  select: {
    id: true,
    title: true,
    // Don't select huge fields if not needed
  },
  take: 20
})
```

---

## Skill 3: Frontend Component Development

**Guidelines for building reusable, accessible components.**

### Component Structure

```typescript
'use client'

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface ComponentProps {
  initialValue?: string
  onSubmit?: (data: any) => Promise<void>
  disabled?: boolean
}

export default function ComponentName({
  initialValue = '',
  onSubmit,
  disabled = false,
}: ComponentProps) {
  // 1. State
  const [value, setValue] = useState(initialValue)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 2. Event handlers
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value)
  }, [])

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!value.trim()) {
      setError('Value required')
      return
    }

    setLoading(true)
    setError(null)
    
    try {
      await onSubmit?.({ value })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }, [value, onSubmit])

  // 3. Render
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="input" className="block text-sm font-medium">
          Label
        </label>
        <Input
          id="input"
          type="text"
          value={value}
          onChange={handleChange}
          disabled={disabled || loading}
          aria-describedby={error ? 'error' : undefined}
          placeholder="Enter value..."
        />
        {error && (
          <p id="error" className="text-red-600 text-sm mt-1">
            {error}
          </p>
        )}
      </div>
      
      <Button
        type="submit"
        disabled={disabled || loading}
        aria-busy={loading}
      >
        {loading ? 'Submitting...' : 'Submit'}
      </Button>
    </form>
  )
}
```

### Accessibility Checklist

- [ ] All inputs have `<label>` elements (or `aria-label`)
- [ ] Form errors linked with `aria-describedby`
- [ ] Buttons have descriptive text (not just icons)
- [ ] Color isn't the only way to convey meaning
- [ ] Loading states announced with `aria-busy`
- [ ] Keyboard navigation works (Tab, Enter, Escape)
- [ ] Focus visible and managed
- [ ] Images have `alt` text
- [ ] Page structure uses semantic HTML (h1, h2, etc.)

### Mobile Responsiveness

```typescript
// Use TailwindCSS responsive classes
export default function Component() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {/* Single column on mobile, 2 on tablet, 3 on desktop */}
      <Card />
      <Card />
      <Card />
    </div>
  )
}

// Or use custom hook to detect viewport
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)
  
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768)
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return isMobile
}
```

---

## Skill 4: Database Query Optimization

**Performance techniques for fast queries at scale.**

### 1. Use Prisma Studio for Inspection

```bash
npx prisma studio
# Opens http://localhost:5555 for visual data exploration
```

### 2. Profile Slow Queries

```typescript
// Log query performance
const start = Date.now()
const results = await db.incident.findMany({...})
console.log(`Query took ${Date.now() - start}ms`)

// Use Prisma's built-in logging
const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error']
})
```

### 3. Common Optimization Patterns

```typescript
// BAD: N+1 query problem
const incidents = await db.incident.findMany()
for (const incident of incidents) {
  const solutions = await db.solution.findMany({
    where: { incidentId: incident.id }
  })  // Queries DB for each incident!
}

// GOOD: Use include/select
const incidents = await db.incident.findMany({
  include: {
    solutions: {
      select: { id: true, approach: true }
    }
  }
})

// BAD: Load unnecessary data
const incident = await db.incident.findUnique({
  where: { id: '123' },
  include: {
    solutions: true,
    comments: true,
    activityLog: true,  // Maybe not needed?
  }
})

// GOOD: Select only needed fields
const incident = await db.incident.findUnique({
  where: { id: '123' },
  select: {
    id: true,
    title: true,
    status: true,
    solutions: {
      select: { approach: true }
    }
  }
})

// BAD: No pagination
const allIncidents = await db.incident.findMany()  // Could be 1M records!

// GOOD: Paginate
const incidents = await db.incident.findMany({
  take: 20,
  skip: (page - 1) * 20,
  orderBy: { createdAt: 'desc' }
})
```

### 4. Add Strategic Indexes

```prisma
model Incident {
  id String @id
  status String
  severity String
  createdAt DateTime @default(now())
  
  // Frequently queried together
  @@index([status, severity, createdAt])
  
  // Full-text search
  @@fulltext([title, description, symptoms])
}
```

### 5. Use Raw Queries for Complex Joins

```typescript
// For queries too complex for ORM
const results = await prisma.$queryRaw`
  SELECT i.id, i.title, COUNT(s.id) as solution_count
  FROM "Incident" i
  LEFT JOIN "Solution" s ON i.id = s."incidentId"
  WHERE i.status = 'RESOLVED'
  GROUP BY i.id, i.title
  ORDER BY solution_count DESC
  LIMIT 10
`
```

---

## Skill 5: Testing Best Practices

**Writing effective tests that catch bugs before production.**

### Unit Tests: API Routes

```typescript
// __tests__/api/incidents/create.test.ts
import { POST } from '@/app/api/incidents/create/route'
import { NextRequest } from 'next/server'

describe('POST /api/incidents/create', () => {
  it('should create incident with valid data', async () => {
    const request = new NextRequest(
      new Request('http://localhost:3000/api/incidents/create', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Database connection timeout',
          description: 'Cannot connect to production database after deployment',
          symptoms: 'All API requests returning 500 error',
          affectedSystems: ['Database'],
          severity: 'P1',
          email: 'user@company.com'
        })
      })
    )
    
    const response = await POST(request)
    expect(response.status).toBe(200)
    
    const data = await response.json()
    expect(data).toHaveProperty('incident.id')
    expect(data).toHaveProperty('similarIncidents')
  })

  it('should reject invalid title', async () => {
    const request = new NextRequest(
      new Request('http://localhost:3000/api/incidents/create', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Short',  // Too short
          // ... other fields
        })
      })
    )
    
    const response = await POST(request)
    expect(response.status).toBe(400)
    
    const data = await response.json()
    expect(data.error).toContain('at least 50 characters')
  })
})
```

### Integration Tests: Database

```typescript
// __tests__/db/incident.test.ts
import { prisma } from '@/lib/db'

describe('Incident Database', () => {
  afterEach(async () => {
    await prisma.incident.deleteMany()
  })

  it('should create and link incidents', async () => {
    const incident1 = await prisma.incident.create({
      data: {
        title: 'Database timeout',
        description: '...',
        symptoms: '...',
        affectedSystems: ['Database'],
        severity: 'P1',
        status: 'RESOLVED',
        createdBy: 'John',
        email: 'john@company.com'
      }
    })

    const incident2 = await prisma.incident.create({
      data: {
        title: 'Database timeout again',
        description: '...',
        symptoms: '...',
        affectedSystems: ['Database'],
        severity: 'P1',
        status: 'OPEN',
        createdBy: 'Jane',
        email: 'jane@company.com',
        linkedToId: incident1.id  // Link to first incident
      }
    })

    const linked = await prisma.incident.findUnique({
      where: { id: incident2.id },
      include: { linkedTo: true }
    })

    expect(linked?.linkedToId).toBe(incident1.id)
    expect(linked?.linkedTo?.id).toBe(incident1.id)
  })
})
```

### Component Tests: React

```typescript
// __tests__/components/IncidentForm.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import IncidentForm from '@/components/IncidentForm'

describe('IncidentForm', () => {
  it('should submit form with valid data', async () => {
    const handleSubmit = jest.fn()
    const { container } = render(<IncidentForm onSubmit={handleSubmit} />)

    const titleInput = screen.getByLabelText('Title')
    const submitButton = screen.getByRole('button', { name: /submit/i })

    await userEvent.type(titleInput, 'Database timeout issue occurring')
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalled()
    })
  })

  it('should show validation error for short title', async () => {
    render(<IncidentForm />)

    const titleInput = screen.getByLabelText('Title')
    const submitButton = screen.getByRole('button', { name: /submit/i })

    await userEvent.type(titleInput, 'Short')
    fireEvent.click(submitButton)

    expect(screen.getByText(/at least 50 characters/i)).toBeInTheDocument()
  })
})
```

### E2E Tests: Playwright

```typescript
// e2e/incident-flow.spec.ts
import { test, expect } from '@playwright/test'

test('should complete full incident reporting flow', async ({ page }) => {
  // Navigate to app
  await page.goto('http://localhost:3000')

  // Click report button
  await page.click('text=Report Incident')

  // Fill form
  await page.fill('input[name="title"]', 'Database connection timeout occurred')
  await page.fill('textarea[name="description"]', 'Full details here...')
  await page.fill('textarea[name="symptoms"]', 'API returning 500 errors...')
  await page.selectOption('select[name="severity"]', 'P1')

  // Submit
  await page.click('button:has-text("Submit")')

  // Wait for similar incidents to show
  await expect(page.locator('text=Similar Incidents Found')).toBeVisible()

  // Choose "Different issue"
  await page.click('button:has-text("Different issue")')

  // Verify redirect to incident detail
  await expect(page).toHaveURL(/\/incidents\/[a-z0-9]+/)
})
```

---

## Skill 6: Deployment & DevOps Checklist

**Ensure reliable, safe deployments to production.**

### Pre-Deployment

- [ ] All tests passing (`npm run test`)
- [ ] No TypeScript errors (`npm run type-check`)
- [ ] No linting issues (`npm run lint`)
- [ ] Build succeeds (`npm run build`)
- [ ] Dependencies up-to-date (`npm audit`)
- [ ] No console errors/warnings in dev
- [ ] Performance acceptable (Lighthouse >90)
- [ ] Secrets properly configured
- [ ] Database backups taken
- [ ] Rollback plan documented

### Staging Deployment

```bash
# Deploy to staging
vercel deploy --prod

# Run smoke tests
npm run test:e2e -- --project=staging

# Monitor for errors
# Check Sentry dashboard
# Verify analytics working

# Test all critical flows:
# - Report incident
# - Search incidents
# - Link incidents
# - View analytics
```

### Production Deployment

```bash
# 1. Create deployment tag
git tag -a v1.0.0 -m "Version 1.0.0"
git push origin v1.0.0

# 2. Merge to main and deploy
git checkout main
git pull origin
npm run build

# 3. Deploy
vercel deploy --prod

# 4. Verify in production
curl https://incident-tracker.company.com/api/health

# 5. Monitor
# - Check error rates in Sentry
# - Monitor database performance
# - Watch for increased latency
# - Check user-facing metrics

# 6. Rollback if needed
vercel rollback  # Reverts to previous deployment
```

### Monitoring & Alerting

```typescript
// app/api/health/route.ts
export async function GET() {
  try {
    // Check database connectivity
    await prisma.incident.count()
    
    return Response.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.APP_VERSION
    })
  } catch (error) {
    return Response.json(
      { status: 'unhealthy', error: 'Database connection failed' },
      { status: 503 }
    )
  }
}
```

Setup health check monitoring:
- Ping `/api/health` every 60 seconds
- Alert if response time >5s or returns non-200
- Alert if error rate >5%
- Alert if database connections exhausted

---

## Skill 7: Code Review Process

**Systematic approach to reviewing PRs for quality.**

### Before Reviewing: Setup

```bash
# Clone PR branch
git fetch origin pull/123/head:pr-123
git checkout pr-123

# Install & test
npm install
npm run type-check
npm run lint
npm run test
npm run build
npm run dev
```

### Review Checklist

#### Functionality
- [ ] Feature works as described in PR
- [ ] Edge cases handled
- [ ] Error handling present
- [ ] No console errors/warnings
- [ ] Performance acceptable

#### Code Quality
- [ ] Code is readable and maintainable
- [ ] Complex logic has comments
- [ ] Follows project conventions
- [ ] No code duplication
- [ ] Proper abstraction levels

#### Type Safety
- [ ] No `any` types
- [ ] All TypeScript errors fixed
- [ ] Proper interfaces/types defined
- [ ] Generic types used appropriately

#### Security
- [ ] Input validation present
- [ ] No SQL injection risk
- [ ] Secrets not in code
- [ ] Authentication/authorization checked
- [ ] Rate limiting considered

#### Testing
- [ ] Tests written for new code
- [ ] Tests are meaningful (not just coverage)
- [ ] Edge cases tested
- [ ] Test coverage >80%
- [ ] All tests pass

#### Performance
- [ ] No N+1 queries
- [ ] Database queries optimized
- [ ] Bundle size acceptable
- [ ] No memory leaks
- [ ] API responses <200ms

#### Documentation
- [ ] Code comments where needed
- [ ] README updated if applicable
- [ ] API docs updated
- [ ] CHANGELOG entry added

### Provide Helpful Feedback

**Good comment:**
```
The search query could be optimized. Currently doing a full table scan.
Consider adding an index on (title, severity) for the WHERE clause.

See: app/api/incidents/search/route.ts line 45
```

**Bad comment:**
```
This is slow.
```

**Suggestion vs. Requirement:**
```
Suggestion (approve anyway):
Consider using a hook here for consistency with other components.

Requirement (block):
This needs input validation to prevent XSS attacks.
```

---

## Skill 8: Documentation Writing

**Clear, comprehensive documentation that helps users and developers.**

### API Endpoint Documentation

```markdown
## Create Incident

**Endpoint:** `POST /api/incidents/create`

**Authentication:** Required (Bearer token)

**Request Body:**
```json
{
  "title": "Database timeout",       // Required: 50-255 chars
  "description": "Full details",     // Required: 100-5000 chars
  "symptoms": "System behavior",     // Required: 50+ chars
  "affectedSystems": ["Database"],   // Required: Array of strings
  "severity": "P1",                  // Required: P1|P2|P3|P4
  "email": "user@company.com"        // Required: Valid email
}
```

**Success Response (200):**
```json
{
  "incident": {
    "id": "cuid123",
    "title": "...",
    "createdAt": "2026-10-07T10:00:00Z"
  },
  "similarIncidents": [
    { "id": "...", "title": "...", "similarity": 0.87 }
  ]
}
```

**Error Responses:**

- **400 Bad Request:** Invalid input
  ```json
  { "error": "Validation failed", "details": { "title": ["Too short"] } }
  ```

- **401 Unauthorized:** Missing or invalid token
  ```json
  { "error": "Authentication required" }
  ```

- **500 Internal Server Error:** Server error
  ```json
  { "error": "Failed to create incident" }
  ```

**Examples:**
```bash
curl -X POST http://localhost:3000/api/incidents/create \
  -H "Authorization: Bearer token123" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Database connection timeout",
    "description": "Cannot connect to production database after deployment",
    "symptoms": "All API requests returning 500",
    "affectedSystems": ["Database", "API"],
    "severity": "P1",
    "email": "user@company.com"
  }'
```
```

### User Guide Section

```markdown
## Reporting an Incident

1. **Click "Report Incident"** button on the dashboard
2. **Fill the form:**
   - **Title:** Brief summary (50-255 characters)
   - **Description:** Detailed explanation of what happened
   - **Symptoms:** What users/systems experienced
   - **Affected Systems:** Select all impacted components
   - **Severity:** Choose P1 (Critical) through P4 (Low)
3. **Click "Submit"**
   - System searches for similar incidents
   - You'll see top 5 matches
4. **Choose your path:**
   - **"Yes, same issue":** Link to existing incident
   - **"Different issue":** Create as new incident
   - **"Similar, different approach":** Link but note difference

**Tips:**
- Be specific in title and symptoms for better matches
- Include error messages and stack traces in description
- Select all affected systems (not just the primary one)
```

---

## Quick Reference: Common Tasks

### Setup

```bash
# Fresh clone
git clone repo && cd incident-tracker
npm install
cp .env.example .env.local
# Edit .env.local with your values
npx prisma migrate deploy
npm run dev
```

### Development

```bash
npm run dev              # Start dev server
npm run type-check      # Check TypeScript
npm run lint            # Check code style
npm run test            # Run tests
npx prisma studio      # Open database GUI
```

### Database

```bash
npx prisma migrate dev --name name    # Create & apply migration
npx prisma migrate deploy             # Apply migrations to production
npx prisma db push                    # Quick schema sync (dev only)
npx prisma db seed                    # Run seed script
npx prisma studio                     # Visual database explorer
```

### Testing

```bash
npm run test                  # All tests
npm run test:watch          # Watch mode
npm run test:coverage       # Coverage report
npm run test:e2e            # End-to-end tests
```

### Building & Deploying

```bash
npm run build                # Build for production
npm run start               # Start production server
vercel deploy --prod        # Deploy to Vercel
vercel rollback            # Revert to previous deployment
```

---

## Success Metrics

Track these to ensure quality:

| Metric | Target | Tool |
|--------|--------|------|
| Test Coverage | >80% | Jest |
| Type Coverage | 100% | TypeScript |
| Lighthouse Score | >90 | Google |
| API Latency (p95) | <200ms | Vercel |
| Error Rate | <0.5% | Sentry |
| Uptime | 99.9% | Vercel |
| Bundle Size | <100KB | Next.js |
| TTFB | <500ms | Web Vitals |

---

**Next time you develop a feature, use these skills as your guide!** 🚀
