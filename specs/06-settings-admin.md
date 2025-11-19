# Settings & Admin Implementation Spec

## Overview

Implement the settings/admin page for monitoring sync status, managing configuration, and viewing system status. This document describes the implementation plan for adding a settings interface to the Anki Interview App, which is built on **Cloudflare infrastructure** (Workers + D1 + Pages).

**Key Design Decision**: GitHub sync runs as a **batch job** (scheduled via cron or external scheduler) rather than a real-time API operation, due to long execution times (several minutes) that would cause HTTP timeouts. The settings page displays read-only status and history of these batch jobs.

## Current Implementation Status

### ✅ Already Implemented

- **Authentication**: Login/logout with JWT sessions (frontend)
- **Study Flow**: Flashcard interface with difficulty ratings
- **Question Management**: Browse, search, filter, view details
- **Database**: Cloudflare D1 with proper schema and indexes
- **Stats API**: Question statistics and answer tracking
- **GitHub Sync Logic**: Implemented as standalone script (`pnpm sync`)
- **OpenAI Parsing**: Extract Q&A from markdown files

### ❌ Not Yet Implemented

- **Settings Page**: No UI exists (referenced in navigation but returns 404)
- **Sync Status API Endpoints**: No `/api/sync/status` or `/api/sync/history` endpoints
- **Batch Job Scheduling**: No cron trigger configured for automatic sync
- **Global Navigation Component**: No unified navigation across pages
- **Sync Metadata Table**: No database tracking of sync history
- **Backend API Authentication**: Backend endpoints have no auth (rely on CORS only)

**Note**: Manual sync via CLI (`pnpm sync`) already works, but needs to be scheduled as a batch job.

## Infrastructure

### Platform: Cloudflare

- **Backend**: Cloudflare Workers with Hono framework
- **Database**: Cloudflare D1 (serverless SQLite)
- **Frontend**: Next.js 15 (App Router) on Cloudflare Pages
- **Configuration**: `backend/wrangler.toml`

### Database Bindings

```toml
# Development
[[d1_databases]]
binding = "DB"
database_name = "anki-interview-db"
database_id = "3d697f9b-2f45-4b63-9907-fc3f26c1595c"

# Production
[env.production.d1_databases]
database_name = "anki-interview-db-prod"
database_id = "5dbc09cb-a3c6-4f2e-b4aa-cef932a2d765"
```

### External Services

- **GitHub API**: Fetch markdown files from repositories (via `@octokit/rest`)
- **OpenAI API**: Parse questions from markdown using GPT-4o-mini

### Configured Question Sources

**Location:** `backend/src/config/sources.ts`

**Active sources:**
- JavaScript Interview Questions
  - URL: `https://raw.githubusercontent.com/sudheerj/javascript-interview-questions/master/README.md`

**Commented out (can be enabled):**
- Back-End Developer Interview Questions
  - URL: `https://raw.githubusercontent.com/arialdomartini/Back-End-Developer-Interview-Questions/master/README.md`

## Prerequisites

- [x] Database setup completed (Cloudflare D1)
- [x] Authentication implemented (frontend JWT sessions)
- [x] GitHub sync script exists (`backend/scripts/sync-github.ts`)
- [ ] Batch job scheduling (Cloudflare Cron or external scheduler)
- [ ] Sync metadata table for tracking batch job executions

## Implementation Tasks

### 1. Backend API Endpoints

The sync functionality exists as a standalone script (`backend/scripts/sync-github.ts`) and should be run as a **batch job** due to its long execution time. The sync process involves fetching from GitHub, parsing with OpenAI, and updating the database, which can take several minutes to complete.

#### 1.1 Batch Job Approach (Recommended)

**Why batch job?** The `sync-github` operation:
- Takes a long time to complete (several minutes)
- Makes multiple external API calls (GitHub, OpenAI)
- Processes large amounts of data
- Should not block HTTP requests or timeout

**Implementation options:**

**Option A: Cloudflare Cron Triggers (Recommended)**

Configure in `backend/wrangler.toml`:

```toml
[triggers]
crons = ["0 2 * * *"]  # Run daily at 2 AM UTC
```

Add cron handler in `backend/src/index.ts`:

```typescript
export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    console.log('Starting scheduled GitHub sync...');

    try {
      const results = await syncAllSources(env.DB, env.OPENAI_API_KEY);

      // Log results to sync_metadata table
      await env.DB.prepare(
        `INSERT INTO sync_metadata (started_at, completed_at, status, questions_inserted, questions_updated)
         VALUES (?, ?, 'completed', ?, ?)`
      ).bind(
        event.scheduledTime,
        new Date().toISOString(),
        results.reduce((sum, r) => sum + r.inserted, 0),
        results.reduce((sum, r) => sum + r.updated, 0)
      ).run();

      console.log('Scheduled sync completed:', results);
    } catch (error) {
      console.error('Scheduled sync failed:', error);

      // Log failure to sync_metadata
      await env.DB.prepare(
        `INSERT INTO sync_metadata (started_at, completed_at, status, error_message)
         VALUES (?, ?, 'failed', ?)`
      ).bind(
        event.scheduledTime,
        new Date().toISOString(),
        error instanceof Error ? error.message : 'Unknown error'
      ).run();
    }
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return app.fetch(request, env, ctx);
  }
};
```

**Option B: External Scheduler (GitHub Actions, etc.)**

Run the sync script via GitHub Actions:

```yaml
# .github/workflows/sync-github.yml
name: Sync GitHub Questions
on:
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM UTC
  workflow_dispatch:  # Manual trigger

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: cd backend && npm install
      - run: cd backend && npx wrangler d1 execute anki-interview-db-prod --remote --command "$(node scripts/sync-github.js)"
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

**Option C: Manual Execution**

For development or on-demand syncing:

```bash
cd backend
pnpm sync  # Runs the standalone script
```

**Note:** This requires extracting the sync logic from `scripts/sync-github.ts` into a reusable library function for the cron approach.

#### 1.2 Create sync status endpoint (Read-only)

Since sync runs as a batch job, the status endpoint provides read-only information about the last sync and current state.

**Location:** `backend/src/index.ts`

```typescript
/**
 * GET /api/sync/status
 * Get current sync status and question count
 * This is a read-only endpoint - sync runs as a batch job
 */
app.get('/api/sync/status', async (c) => {
  try {
    const db = c.env.DB;

    // Get total question count
    const { count } = await db
      .prepare('SELECT COUNT(*) as count FROM questions')
      .first<{ count: number }>();

    // Get last successful sync from metadata
    const lastSync = await db
      .prepare(
        `SELECT completed_at, questions_inserted, questions_updated, status
         FROM sync_metadata
         WHERE status = 'completed'
         ORDER BY completed_at DESC
         LIMIT 1`
      )
      .first<{
        completed_at: string;
        questions_inserted: number;
        questions_updated: number;
        status: string;
      }>();

    // Check if a sync is currently running
    const runningSync = await db
      .prepare(
        `SELECT started_at
         FROM sync_metadata
         WHERE status = 'running'
         ORDER BY started_at DESC
         LIMIT 1`
      )
      .first<{ started_at: string }>();

    return c.json({
      totalQuestions: count || 0,
      lastSync: lastSync
        ? {
            timestamp: lastSync.completed_at,
            inserted: lastSync.questions_inserted,
            updated: lastSync.questions_updated,
          }
        : null,
      isRunning: !!runningSync,
      runningSince: runningSync?.started_at || null,
    });
  } catch (error) {
    console.error('Status error:', error);
    return c.json({ error: 'Failed to get sync status' }, 500);
  }
});
```

#### 1.3 Add sync metadata tracking (Required)

**Required** for batch job tracking. This table stores the execution history of sync jobs:

**Location:** `backend/db/migrations/0002_sync_metadata.sql`

```sql
-- Migration: Add sync metadata tracking
-- Created: 2025-01-XX

CREATE TABLE IF NOT EXISTS sync_metadata (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at DATETIME NOT NULL,
  completed_at DATETIME,
  status TEXT CHECK(status IN ('running', 'completed', 'failed')) NOT NULL,
  sources_count INTEGER,
  questions_inserted INTEGER,
  questions_updated INTEGER,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_sync_metadata_completed_at
  ON sync_metadata(completed_at DESC);
```

**Run migration:**

```bash
cd backend
npx wrangler d1 migrations apply anki-interview-db --local
npx wrangler d1 migrations apply anki-interview-db --remote
```

**Update sync endpoint to log metadata:**

```typescript
// At start of sync
const syncRecord = await db
  .prepare(
    `INSERT INTO sync_metadata (started_at, status, sources_count)
     VALUES (?, 'running', ?)
     RETURNING id`
  )
  .bind(new Date().toISOString(), sources.length)
  .first<{ id: number }>();

try {
  // ... perform sync ...

  // On success
  await db
    .prepare(
      `UPDATE sync_metadata
       SET completed_at = ?,
           status = 'completed',
           questions_inserted = ?,
           questions_updated = ?
       WHERE id = ?`
    )
    .bind(
      new Date().toISOString(),
      totals.inserted,
      totals.updated,
      syncRecord.id
    )
    .run();
} catch (error) {
  // On failure
  await db
    .prepare(
      `UPDATE sync_metadata
       SET completed_at = ?,
           status = 'failed',
           error_message = ?
       WHERE id = ?`
    )
    .bind(
      new Date().toISOString(),
      error.message,
      syncRecord.id
    )
    .run();
  throw error;
}
```

#### 1.4 Create sync history endpoint (Optional)

**Location:** `backend/src/index.ts`

```typescript
/**
 * GET /api/sync/history
 * Get recent sync history
 */
app.get('/api/sync/history', async (c) => {
  try {
    const db = c.env.DB;

    const history = await db
      .prepare(
        `SELECT *
         FROM sync_metadata
         ORDER BY started_at DESC
         LIMIT 10`
      )
      .all();

    return c.json({
      history: history.results || [],
    });
  } catch (error) {
    console.error('History error:', error);
    return c.json({ error: 'Failed to get sync history' }, 500);
  }
});
```

**Acceptance Criteria:**

- [ ] Batch job configured (Cloudflare Cron or external scheduler)
- [ ] Sync executes on schedule without blocking HTTP requests
- [ ] GET /api/sync/status returns question count, last sync time, and running status
- [ ] GET /api/sync/history returns sync history from metadata table
- [ ] Sync metadata table tracks all sync executions (success/failure)
- [ ] Error handling for missing API keys
- [ ] CORS configured to allow frontend requests

### 2. Frontend API Routes (Proxy Layer)

Since the frontend runs on Cloudflare Pages and the backend runs on Cloudflare Workers, we need to proxy read-only status requests through frontend API routes to add authentication.

**Note:** No sync trigger endpoint is needed since sync runs as a batch job.

#### 2.1 Create sync status proxy endpoint

**Location:** `frontend/src/app/api/sync/status/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';

export const runtime = 'edge';

const BACKEND_URL = process.env.BACKEND_API_URL || 'http://localhost:8787';

export async function GET() {
  try {
    await requireSession();

    const response = await fetch(`${BACKEND_URL}/api/sync/status`);
    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(
      { error: 'Failed to get sync status' },
      { status: 500 }
    );
  }
}
```

#### 2.2 Environment variables

Add to `frontend/.env.local`:

```bash
BACKEND_API_URL=http://localhost:8787
```

Add to Cloudflare Pages environment variables:

```bash
BACKEND_API_URL=https://anki-interview-app.your-worker.workers.dev
```

**Acceptance Criteria:**

- [ ] Frontend API route proxies status requests to backend
- [ ] Authentication required for viewing sync status
- [ ] Error handling for backend failures
- [ ] BACKEND_API_URL configured for dev and production

### 3. Settings Page UI

#### 3.1 Create settings page

**Location:** `frontend/src/app/settings/page.tsx`

```typescript
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import LogoutButton from '@/components/LogoutButton';

interface SyncStatus {
  totalQuestions: number;
  lastSync: {
    timestamp: string;
    inserted: number;
    updated: number;
  } | null;
  isRunning: boolean;
  runningSince: string | null;
}

export default function SettingsPage() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadStatus();
    // Refresh status every 30 seconds to check for batch job updates
    const interval = setInterval(loadStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadStatus = async () => {
    try {
      const response = await fetch('/api/sync/status');
      if (response.ok) {
        const data = await response.json();
        setStatus(data);
        setError(null);
      } else {
        setError('Failed to load sync status');
      }
    } catch (err) {
      console.error('Failed to load status:', err);
      setError('Network error. Please refresh the page.');
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString();
  };

  const getNextSyncTime = () => {
    // Assuming daily sync at 2 AM UTC
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(2, 0, 0, 0);
    return tomorrow.toLocaleString();
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8 flex justify-between items-center">
          <h1 className="text-2xl font-bold">Settings</h1>
          <nav className="space-x-4">
            <Link href="/study" className="text-blue-600 hover:text-blue-800">
              Study
            </Link>
            <Link href="/questions" className="text-blue-600 hover:text-blue-800">
              Questions
            </Link>
            <LogoutButton />
          </nav>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        {/* System Status */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">System Status</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <div className="text-sm text-gray-600">Total Questions</div>
              <div className="text-2xl font-bold text-blue-600">
                {status?.totalQuestions ?? '—'}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Last Sync</div>
              <div className="text-lg font-medium">
                {status?.lastSync
                  ? formatDate(status.lastSync.timestamp)
                  : 'Never'}
              </div>
              {status?.lastSync && (
                <div className="text-xs text-gray-500 mt-1">
                  +{status.lastSync.inserted} added, {status.lastSync.updated}{' '}
                  updated
                </div>
              )}
            </div>
            <div>
              <div className="text-sm text-gray-600">Status</div>
              <div className="flex items-center mt-1">
                {status?.isRunning ? (
                  <>
                    <div className="w-2 h-2 bg-yellow-500 rounded-full mr-2 animate-pulse"></div>
                    <span className="text-yellow-700 font-medium">
                      Syncing...
                    </span>
                  </>
                ) : (
                  <>
                    <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                    <span className="text-green-700 font-medium">Idle</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* GitHub Sync */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">GitHub Sync</h2>
          <p className="text-gray-600 mb-4">
            Questions are automatically synced from configured GitHub repositories
            using a scheduled batch job. The sync process runs daily at 2:00 AM UTC
            and uses OpenAI to parse questions from markdown files.
          </p>

          {status?.isRunning && (
            <div className="mb-4 bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded">
              <div className="flex items-center">
                <div className="w-4 h-4 border-2 border-yellow-600 border-t-transparent rounded-full animate-spin mr-3"></div>
                <div>
                  <div className="font-semibold">Sync in progress</div>
                  <div className="text-sm">
                    Started {formatDate(status.runningSince)}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Sync Schedule:</span>
              <span className="font-medium">Daily at 2:00 AM UTC</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Next Scheduled Sync:</span>
              <span className="font-medium">{getNextSyncTime()}</span>
            </div>
          </div>

          <p className="mt-4 text-sm text-gray-500">
            To manually trigger a sync, use the command line:{' '}
            <code className="bg-gray-100 px-2 py-1 rounded">
              cd backend && pnpm sync
            </code>
          </p>
        </div>

        {/* Configured Sources */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Configured Sources</h2>
          <div className="space-y-2">
            <div className="flex items-start">
              <div className="flex-1">
                <div className="font-medium">
                  JavaScript Interview Questions
                </div>
                <div className="text-sm text-gray-500 break-all">
                  https://raw.githubusercontent.com/sudheerj/javascript-interview-questions/master/README.md
                </div>
              </div>
            </div>
          </div>
          <p className="mt-4 text-sm text-gray-500">
            To add more sources, update the configuration in{' '}
            <code className="bg-gray-100 px-1 py-0.5 rounded">
              backend/src/config/sources.ts
            </code>
          </p>
        </div>

        {/* Account */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Account</h2>
          <div className="flex justify-between items-center">
            <div>
              <div className="text-sm text-gray-600">Signed in as</div>
              <div className="font-medium">Administrator</div>
            </div>
            <LogoutButton />
          </div>
        </div>

        {/* Advanced Options (Future) */}
        <div className="bg-white rounded-lg shadow p-6 mt-6">
          <h2 className="text-lg font-semibold mb-4">Advanced</h2>
          <div className="space-y-3">
            <button
              className="text-red-600 hover:text-red-800 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled
            >
              Clear All Answer History
            </button>
            <p className="text-sm text-gray-500">
              (Coming soon: Delete all answer logs while keeping questions)
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
```

**Acceptance Criteria:**

- [ ] Displays system status (question count, last sync, sync status)
- [ ] Shows sync schedule and next scheduled run time
- [ ] Auto-refreshes status every 30 seconds
- [ ] Shows "Syncing..." indicator when batch job is running
- [ ] Displays last sync results (inserted/updated counts)
- [ ] Shows configured sources (JavaScript Interview Questions)
- [ ] Includes instructions for manual sync via CLI
- [ ] Logout button present
- [ ] Error handling for status fetch failures
- [ ] Responsive design

### 4. Navigation Component (Optional)

To provide consistent navigation across all pages, create a reusable component.

#### 4.1 Create navigation component

**Location:** `frontend/src/components/Navigation.tsx`

```typescript
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import LogoutButton from './LogoutButton';

export default function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="bg-white shadow">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex justify-between h-16">
          <div className="flex space-x-8">
            <Link
              href="/study"
              className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${
                pathname === '/study'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Study
            </Link>
            <Link
              href="/questions"
              className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${
                pathname === '/questions' || pathname?.startsWith('/questions/')
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Questions
            </Link>
            <Link
              href="/settings"
              className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${
                pathname === '/settings'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Settings
            </Link>
          </div>
          <div className="flex items-center">
            <LogoutButton />
          </div>
        </div>
      </div>
    </nav>
  );
}
```

#### 4.2 Update pages to use navigation

**Option A:** Add to individual pages

```typescript
import Navigation from '@/components/Navigation';

export default function StudyPage() {
  return (
    <>
      <Navigation />
      <div className="min-h-screen bg-gray-50 py-8">
        {/* Page content */}
      </div>
    </>
  );
}
```

**Option B:** Add to layout (affects all pages)

```typescript
// frontend/src/app/layout.tsx
import Navigation from '@/components/Navigation';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Navigation />
        <main>{children}</main>
      </body>
    </html>
  );
}
```

**Note:** If using layout approach, exclude navigation from `/login` page.

**Acceptance Criteria:**

- [ ] Navigation visible on study, questions, and settings pages
- [ ] Active page highlighted with blue underline
- [ ] Logout button accessible
- [ ] Responsive design for mobile

### 5. Environment Variables Setup

#### 5.1 Backend environment variables

**Cloudflare Workers** (set via `wrangler secret put` or dashboard):

```bash
APP_USERNAME=admin
APP_PASSWORD_HASH=<bcrypt-hash>
SESSION_SECRET=<random-32-char-string>
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini  # Optional, defaults to gpt-4o-mini
GITHUB_TOKEN=ghp_...      # Optional, for higher rate limits
```

#### 5.2 Frontend environment variables

**Cloudflare Pages** (set via dashboard):

```bash
APP_USERNAME=admin
APP_PASSWORD_HASH_B64=<base64-bcrypt-hash>
SESSION_SECRET=<same-as-backend>
SESSION_COOKIE_NAME=anki_session
SESSION_MAX_AGE=604800
BACKEND_API_URL=https://anki-interview-app.your-worker.workers.dev
```

**Development** (`.env.local`):

```bash
APP_USERNAME=admin
APP_PASSWORD_HASH_B64=<base64-bcrypt-hash>
SESSION_SECRET=<random-32-char-string>
SESSION_COOKIE_NAME=anki_session
SESSION_MAX_AGE=604800
BACKEND_API_URL=http://localhost:8787
```

#### 5.3 Generate password hash

```bash
# Install bcrypt-cli
npm install -g bcrypt-cli

# Generate hash
bcrypt-cli "your-password" 10

# For frontend (base64 encoded)
echo -n "bcrypt-hash-here" | base64
```

**Acceptance Criteria:**

- [ ] All required environment variables documented
- [ ] Backend secrets configured in Cloudflare Workers
- [ ] Frontend env vars configured in Cloudflare Pages
- [ ] Password hash generated securely
- [ ] SESSION_SECRET matches between frontend and backend

### 6. Testing

#### 6.1 Backend API testing

```bash
# Start backend locally
cd backend
pnpm dev

# Test endpoints
curl http://localhost:8787/health
curl http://localhost:8787/api/sync/status
curl http://localhost:8787/api/sync/history

# Test batch job manually
pnpm sync

# Test cron trigger (if configured)
# Use Cloudflare dashboard to manually trigger the cron
```

#### 6.2 Frontend testing

```bash
# Start frontend locally
cd frontend
pnpm dev

# Test in browser
# 1. Navigate to http://localhost:3000/settings
# 2. Verify system status displays (question count, last sync, status)
# 3. Verify sync schedule information shows
# 4. Verify page auto-refreshes (check network tab after 30s)
# 5. Trigger a manual sync via CLI and verify status updates
```

#### 6.3 Manual testing checklist

**Settings page:**

- [ ] Navigate to /settings
- [ ] System status displays correctly (question count, last sync time, status)
- [ ] Sync schedule shows "Daily at 2:00 AM UTC"
- [ ] Next scheduled sync time displays correctly
- [ ] Status auto-refreshes every 30 seconds
- [ ] When sync is running, shows "Syncing..." indicator with yellow status
- [ ] When sync is idle, shows green "Idle" status
- [ ] Last sync results show inserted/updated counts
- [ ] Manual sync instructions displayed
- [ ] Configured sources listed (JavaScript Interview Questions)
- [ ] Logout button works
- [ ] Error handling works for status fetch failures

**Navigation (if implemented):**

- [ ] Navigation appears on all pages
- [ ] Active page highlighted
- [ ] All links work
- [ ] Responsive on mobile

**Integration:**

- [ ] Can log in successfully
- [ ] Settings page requires authentication
- [ ] Status endpoint requires authentication
- [ ] Batch job runs successfully (manual or scheduled)
- [ ] Questions synced by batch job appear in study flow
- [ ] Answer tracking works after sync

### 7. Deployment

#### 7.1 Deploy backend

```bash
cd backend

# Deploy to production
pnpm deploy

# Or manually
npx wrangler deploy

# Run production migration (if adding sync_metadata table)
npx wrangler d1 migrations apply anki-interview-db-prod --remote
```

#### 7.2 Deploy frontend

```bash
cd frontend

# Build for production
pnpm build

# Deploy to Cloudflare Pages
# (Usually automatic via GitHub integration)
# Or manually:
npx wrangler pages deploy .next
```

#### 7.3 Post-deployment testing

- [ ] Can access production URL
- [ ] Can log in with credentials
- [ ] Settings page loads
- [ ] Status endpoint returns current data
- [ ] Cron trigger configured correctly (check Cloudflare dashboard)
- [ ] Manual sync works via CLI (`cd backend && pnpm sync`)
- [ ] Questions appear in study flow after sync
- [ ] All navigation works

## Success Criteria

### Minimum Viable Settings Page

- [ ] Settings page exists and is accessible
- [ ] Displays total question count
- [ ] Shows last sync timestamp and results
- [ ] Shows current sync status (idle/syncing)
- [ ] Displays sync schedule and next run time
- [ ] Batch job configured to run on schedule
- [ ] Auto-refreshes status to show batch job progress
- [ ] Includes manual sync instructions
- [ ] Error handling for status fetch failures
- [ ] Logout functionality present

### Full Implementation (Optional)

- [ ] Global navigation component
- [ ] Sync history tracking
- [ ] Sync history display
- [ ] Advanced options (clear history, etc.)
- [ ] Responsive design
- [ ] Loading states and animations

## Architecture Decisions

### Why Proxy Through Frontend API Routes?

The backend (Cloudflare Workers) has no authentication. To secure sync operations:

1. Frontend API routes (`/api/sync`) require session authentication
2. Frontend proxies authenticated requests to backend
3. Backend validates requests via CORS

Alternative: Add authentication to backend Workers, but this adds complexity.

### Why Not Use Server Components?

Next.js on Cloudflare Pages currently works best with static export. The settings page uses client-side data fetching for simplicity and compatibility.

### Sync: Batch Job vs. Real-time API?

- **Problem**: GitHub sync takes several minutes and involves multiple external API calls (GitHub, OpenAI)
- **Real-time approach**: POST /api/sync endpoint triggered from UI
  - ❌ Long execution time causes HTTP timeouts
  - ❌ Blocks Workers request duration limits
  - ❌ Poor user experience (user waits several minutes)
- **Batch job approach**: Scheduled execution (cron triggers or external scheduler)
  - ✅ Runs asynchronously without blocking
  - ✅ No timeout concerns
  - ✅ Can be monitored via status endpoint
  - ✅ Manual execution still available via CLI
- **Decision**: Use batch job approach with scheduled execution
  - Cloudflare Cron Triggers for automatic daily sync
  - CLI script (`pnpm sync`) for manual/on-demand execution
  - Read-only status API to monitor batch job progress

## Future Enhancements

### Near-term
- [ ] Add more question sources to `sources.ts`
- [ ] Implement "Clear All Answer History" button
- [ ] Add manual question creation form
- [ ] Display detailed sync history with per-source results
- [ ] Configure sync schedule from UI (instead of hardcoded cron)

### Long-term
- [ ] Email/webhook notifications for sync failures
- [ ] Slack integration for sync status updates
- [ ] Display sync progress percentage (requires streaming status updates)
- [ ] Question approval workflow (review before adding)
- [ ] Custom parsing rules per source
- [ ] Export questions to JSON/CSV
- [ ] Import questions from CSV
- [ ] Multiple sync schedules for different sources

## References

- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Cloudflare D1 Docs](https://developers.cloudflare.com/d1/)
- [Cloudflare Pages Docs](https://developers.cloudflare.com/pages/)
- [Next.js on Cloudflare Pages](https://developers.cloudflare.com/pages/framework-guides/nextjs/)
- [Hono Framework](https://hono.dev/)
- [OpenAI API](https://platform.openai.com/docs)
- [GitHub API (Octokit)](https://github.com/octokit/rest.js)

## Troubleshooting

### Sync fails with "OPENAI_API_KEY not configured"

**Solution:** Set `OPENAI_API_KEY` in Cloudflare Workers environment variables.

```bash
cd backend
npx wrangler secret put OPENAI_API_KEY
# Enter your key when prompted
```

### Frontend can't reach backend API

**Solution:** Check `BACKEND_API_URL` environment variable.

- Development: `http://localhost:8787`
- Production: Your Cloudflare Worker URL

### CORS errors when calling backend

**Solution:** Backend CORS configuration allows localhost and HTTPS origins. Verify your frontend URL matches the CORS policy in `backend/src/index.ts`.

### Session authentication fails

**Solution:** Ensure `SESSION_SECRET` matches between frontend and backend.
