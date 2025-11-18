# Settings & Admin Implementation Spec

## Overview

This spec outlines the settings/admin page for managing configuration and viewing system status.

**Current Implementation Status:**
- ✅ Database setup complete (D1 with migrations)
- ✅ Authentication complete (JWT + bcrypt)
- ✅ Study flow and question management working
- ⚠️ GitHub sync implemented as **CLI script only** (not exposed as web API)
- ❌ Settings page UI **not yet implemented**

**Important Note:**
The current implementation does **NOT** support triggering sync from the frontend UI. Sync is performed via CLI script only:
```bash
cd backend
pnpm run sync:local   # Local development
pnpm run sync         # Production sync
```

This spec describes the **target architecture** for when sync is exposed as a web API.

## Architecture Notes

### Current Sync Implementation

**How Sync Currently Works:**
```bash
cd backend
pnpm run sync:local   # Syncs to local D1 database
pnpm run sync         # Syncs to production D1 database
```

The sync script (`backend/scripts/sync-github.ts`):
1. Reads configured sources from `backend/src/config/sources.ts`
2. Fetches markdown files from GitHub using Octokit
3. Sends content to OpenAI API for parsing into Q&A pairs
4. Upserts questions to D1 database (inserts new, updates existing)
5. Returns detailed results (inserted, updated counts per source)

**Why It's CLI-Only:**
- The sync logic exists and works perfectly
- It's just not exposed as a web API endpoint yet
- Implementing `/api/sync` endpoint would require refactoring to handle:
  - Long-running requests (sync can take minutes)
  - Error handling for API responses
  - Progress updates for frontend
  - Timeout management

**Options for Frontend Sync (Future):**
1. **Simple API wrapper** - Create `/api/sync` that calls sync script, blocks until done
2. **Queue-based** - Use Cloudflare Queues/Durable Objects for async processing
3. **Cron-based** - Schedule automatic syncs, show last sync time only
4. **Keep CLI-only** - Simple, works well for admin operations

For MVP, the Settings page can work without sync functionality by showing system stats and a message about CLI sync.

## Prerequisites

- ✅ Database setup completed (`questions` and `answer_logs` tables)
- ✅ Authentication implemented (JWT sessions with HTTP-only cookies)
- ⚠️ GitHub sync logic exists (in `backend/scripts/sync-github.ts`) but not exposed as API

## Features

### Currently Available via CLI
1. **GitHub Sync** - CLI script syncs from configured GitHub repos
2. **Question Management** - Full CRUD via `/questions` page

### To Be Implemented (This Spec)
1. **Settings Page UI** - View system status and configuration
2. **Sync API Endpoints** - Expose sync functionality as web API (optional/future)
3. **Sync Status Display** - View last sync time and question count
4. **Source Management** - View configured sources
5. **Account Management** - Logout functionality

## Implementation Tasks

### 1. Settings Page UI (Status: NOT YET IMPLEMENTED)

**Current Status:** This page does not exist yet. The code below shows the target design.

**Note on Sync Functionality:** The sync button in this UI requires implementing the `/api/sync` endpoint (see Section 1.2 below). Until then, sync must be performed via CLI.

#### 1.1 Create settings page

**Location:** `frontend/src/app/settings/page.tsx`

```typescript
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import LogoutButton from '@/components/LogoutButton';

interface SyncStatus {
  totalQuestions: number;
  lastSync: string | null;
}

interface SyncResult {
  success: boolean;
  results: Array<{
    source: string;
    total: number;
    inserted: number;
    updated: number;
    error?: string;
  }>;
  totals: {
    inserted: number;
    updated: number;
    total: number;
  };
  timestamp: string;
}

export default function SettingsPage() {
  const router = useRouter();
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async () => {
    try {
      const response = await fetch('/api/sync/status');
      const data = await response.json();
      setStatus(data);
    } catch (err) {
      console.error('Failed to load status:', err);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    setSyncResult(null);

    try {
      const response = await fetch('/api/sync', {
        method: 'POST',
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Sync failed');
        return;
      }

      setSyncResult(data);

      // Reload status after successful sync
      await loadStatus();

    } catch (err) {
      setError('Network error. Please try again.');
      console.error('Sync error:', err);
    } finally {
      setSyncing(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString();
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

        {/* System Status */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">System Status</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-gray-600">Total Questions</div>
              <div className="text-2xl font-bold text-blue-600">
                {status?.totalQuestions ?? '—'}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Last Sync</div>
              <div className="text-lg font-medium">
                {formatDate(status?.lastSync ?? null)}
              </div>
            </div>
          </div>
        </div>

        {/* GitHub Sync */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">GitHub Sync</h2>
          <p className="text-gray-600 mb-4">
            Sync interview questions from configured GitHub repositories.
          </p>

          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          {syncResult && (
            <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
              <div className="font-semibold mb-2">Sync completed!</div>
              <div className="text-sm">
                <div>Inserted: {syncResult.totals.inserted}</div>
                <div>Updated: {syncResult.totals.updated}</div>
                <div>Total processed: {syncResult.totals.total}</div>
              </div>

              {syncResult.results.length > 0 && (
                <div className="mt-4 space-y-2">
                  {syncResult.results.map((result, idx) => (
                    <div key={idx} className="text-sm">
                      <div className="font-medium">{result.source}</div>
                      {result.error ? (
                        <div className="text-red-600">Error: {result.error}</div>
                      ) : (
                        <div className="text-gray-600">
                          {result.inserted} inserted, {result.updated} updated
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <button
            onClick={handleSync}
            disabled={syncing}
            className="w-full md:w-auto px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {syncing ? 'Syncing...' : 'Sync from GitHub'}
          </button>

          {syncing && (
            <div className="mt-4 text-sm text-gray-600">
              This may take a few moments. Please wait...
            </div>
          )}
        </div>

        {/* Configured Sources */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Configured Sources</h2>
          <div className="space-y-2">
            <div className="flex items-start">
              <div className="flex-1">
                <div className="font-medium">
                  Back-End Developer Interview Questions
                </div>
                <div className="text-sm text-gray-500 break-all">
                  https://raw.githubusercontent.com/arialdomartini/Back-End-Developer-Interview-Questions/master/README.md
                </div>
              </div>
            </div>
            {/* Add more sources here as configured */}
          </div>
          <p className="mt-4 text-sm text-gray-500">
            To add more sources, update the configuration in{' '}
            <code className="bg-gray-100 px-1 py-0.5 rounded">
              /src/config/sources.ts
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

#### 1.2 Required Backend API Endpoints (NOT YET IMPLEMENTED)

The Settings page above depends on these backend endpoints that **do not currently exist**:

**POST `/api/sync`** - Trigger manual sync
- Currently: Sync logic exists in `backend/scripts/sync-github.ts` (CLI only)
- Needed: Expose sync logic as web API endpoint
- Implementation options:
  - Option A: Create API route that calls sync script
  - Option B: Refactor sync logic into reusable function, call from API
  - Option C: Use Cloudflare Queues/Durable Objects for async processing

**GET `/api/sync/status`** - Get sync status
- Returns: `{ totalQuestions: number, lastSync: string | null }`
- Implementation:
  ```typescript
  // Count questions
  SELECT COUNT(*) as count FROM questions

  // Get last sync time (simple approach)
  SELECT MAX(updated_at) as timestamp FROM questions
  ```

**Note:** Until these endpoints are implemented, the Settings page will show errors when trying to sync or load status. For MVP, these can be marked as "Coming Soon" in the UI.

**Acceptance Criteria:**

- [ ] Displays system status (question count, last sync)
- [ ] Sync button triggers GitHub sync (requires `/api/sync` endpoint)
- [ ] Shows sync progress/loading state
- [ ] Displays sync results
- [ ] Shows configured sources
- [ ] Logout button present
- [ ] Error handling for sync failures

**Alternative MVP Approach:**
- Remove sync button from initial implementation
- Show "Sync via CLI: `pnpm run sync`" message instead
- Add sync button later when API is ready

### 2. Enhanced Status Tracking (OPTIONAL - Future Enhancement)

**Status:** NOT IMPLEMENTED - Not required for MVP

This section describes optional enhancements for tracking sync history. For MVP, simply track:
- Question count: `SELECT COUNT(*) FROM questions`
- Last sync time: `SELECT MAX(updated_at) FROM questions`

#### 2.1 Add sync metadata table (optional v2 feature)

**Status:** Not created yet. Skip this for initial implementation.

**Location:** `backend/db/migrations/0002_sync_metadata.sql` (to be created)

```sql
CREATE TABLE IF NOT EXISTS sync_metadata (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at DATETIME NOT NULL,
  completed_at DATETIME,
  status TEXT CHECK(status IN ('running', 'completed', 'failed')),
  sources_count INTEGER,
  questions_inserted INTEGER,
  questions_updated INTEGER,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_sync_metadata_completed_at
  ON sync_metadata(completed_at DESC);
```

**Update sync endpoint to log:**

```typescript
// At start of sync
const syncId = await db
  .prepare(
    `INSERT INTO sync_metadata (started_at, status)
     VALUES (?, 'running')
     RETURNING id`
  )
  .bind(new Date().toISOString())
  .first<{ id: number }>();

// At end of sync (success)
await db
  .prepare(
    `UPDATE sync_metadata
     SET completed_at = ?,
         status = 'completed',
         sources_count = ?,
         questions_inserted = ?,
         questions_updated = ?
     WHERE id = ?`
  )
  .bind(
    new Date().toISOString(),
    results.length,
    totals.inserted,
    totals.updated,
    syncId.id
  )
  .run();

// On error
await db
  .prepare(
    `UPDATE sync_metadata
     SET completed_at = ?,
         status = 'failed',
         error_message = ?
     WHERE id = ?`
  )
  .bind(new Date().toISOString(), error.message, syncId.id)
  .run();
```

**Acceptance Criteria:**

- [ ] Sync history tracked in database
- [ ] Can query sync history
- [ ] Useful for debugging sync issues

**Note:** This is a future enhancement. For MVP, skip this table.

#### 2.2 Sync history endpoint (OPTIONAL - Future Enhancement)

**Status:** NOT IMPLEMENTED - Requires `sync_metadata` table first

**Location:** `frontend/src/app/api/sync/history/route.ts` (to be created)

```typescript
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { getDB } from "@/lib/db";

export const runtime = "edge";

interface SyncHistory {
  id: number;
  started_at: string;
  completed_at: string | null;
  status: "running" | "completed" | "failed";
  sources_count: number | null;
  questions_inserted: number | null;
  questions_updated: number | null;
  error_message: string | null;
}

export async function GET() {
  try {
    await requireSession();

    const db = getDB();

    const history = await db
      .prepare(
        `SELECT *
         FROM sync_metadata
         ORDER BY started_at DESC
         LIMIT 10`
      )
      .all<SyncHistory>();

    return NextResponse.json({
      history: history.results || [],
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(
      { error: "Failed to get sync history" },
      { status: 500 }
    );
  }
}
```

### 3. Navigation Component (OPTIONAL - Future Enhancement)

**Status:** NOT IMPLEMENTED - Not required for MVP

Current pages use manual navigation links. A global navigation component would improve UX but is not blocking.

**For MVP:** Settings page can include manual links to other pages (as shown in section 1.1).

#### 3.1 Create global navigation (Future)

**Location:** `frontend/src/components/Navigation.tsx` (to be created)

```typescript
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import LogoutButton from './LogoutButton';

export default function Navigation() {
  const pathname = usePathname();

  const isActive = (path: string) => {
    return pathname === path
      ? 'bg-blue-600 text-white'
      : 'text-gray-700 hover:bg-gray-100';
  };

  return (
    <nav className="bg-white shadow">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex justify-between h-16">
          <div className="flex space-x-8">
            <Link
              href="/study"
              className={`inline-flex items-center px-4 border-b-2 text-sm font-medium ${
                pathname === '/study'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Study
            </Link>
            <Link
              href="/questions"
              className={`inline-flex items-center px-4 border-b-2 text-sm font-medium ${
                pathname === '/questions' || pathname?.startsWith('/questions/')
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Questions
            </Link>
            <Link
              href="/settings"
              className={`inline-flex items-center px-4 border-b-2 text-sm font-medium ${
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

**Usage in layout:**

```typescript
// /src/app/layout.tsx or specific page layouts
import Navigation from '@/components/Navigation';

export default function Layout({ children }) {
  return (
    <>
      <Navigation />
      <main>{children}</main>
    </>
  );
}
```

**Acceptance Criteria:**

- [ ] Navigation visible on all pages
- [ ] Active page highlighted
- [ ] Logout button accessible
- [ ] Responsive design

### 4. Home Page / Dashboard (OPTIONAL - Current: Simple Redirect)

**Current Implementation:** Home page (`frontend/src/app/page.tsx`) redirects to `/study`

```typescript
import { redirect } from "next/navigation";

export default function HomePage() {
  redirect("/study");
}
```

This is sufficient for MVP. A full dashboard is optional.

**Future Enhancement:** Create a dashboard with stats and quick actions (see code below)

```typescript
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface DashboardStats {
  totalQuestions: number;
  answeredQuestions: number;
  recentActivity: number;
}

export default function HomePage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    fetch('/api/questions/stats')
      .then(res => res.json())
      .then(setStats)
      .catch(console.error);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <h1 className="text-3xl font-bold mb-8">
          Welcome to Anki Interview App
        </h1>

        {/* Quick stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-3xl font-bold text-blue-600">
              {stats?.totalQuestions ?? '—'}
            </div>
            <div className="text-gray-600">Total Questions</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-3xl font-bold text-green-600">
              {stats?.answeredQuestions ?? '—'}
            </div>
            <div className="text-gray-600">Answered</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-3xl font-bold text-purple-600">
              {stats?.recentActivity ?? '—'}
            </div>
            <div className="text-gray-600">Last 7 Days</div>
          </div>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Link
            href="/study"
            className="block bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-lg p-8 text-center"
          >
            <h2 className="text-2xl font-bold mb-2">Start Studying</h2>
            <p className="text-blue-100">Begin a flashcard session</p>
          </Link>

          <Link
            href="/questions"
            className="block bg-white hover:bg-gray-50 border-2 border-gray-200 rounded-lg shadow-lg p-8 text-center"
          >
            <h2 className="text-2xl font-bold mb-2">Browse Questions</h2>
            <p className="text-gray-600">Explore all questions</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
```

**Acceptance Criteria:**

- [ ] Homepage accessible
- [ ] Shows overview stats
- [ ] Quick links to study and questions
- [ ] Clean, welcoming design

### 5. Testing

#### 5.1 Manual testing checklist

**Settings page:**

- [ ] Navigate to /settings
- [ ] System status displays correctly
- [ ] Click "Sync from GitHub" → sync runs
- [ ] Loading state shows during sync
- [ ] Success message appears after sync
- [ ] Question count updates after sync
- [ ] Last sync time updates
- [ ] Error handling works for sync failures
- [ ] Configured sources listed
- [ ] Logout button works

**Navigation:**

- [ ] Navigation appears on all pages
- [ ] Active page highlighted
- [ ] All links work
- [ ] Responsive on mobile

**Home page:**

- [ ] Displays dashboard stats
- [ ] Quick action links work

### 6. Production Considerations

#### 6.1 Environment variables checklist

**Current Status:** Environment variables are configured. Verify these are set:

**Frontend** (Cloudflare Pages):
- [x] `APP_USERNAME` - Admin username
- [x] `APP_PASSWORD_HASH_B64` - Base64-encoded bcrypt hash (note: uses B64 encoding)
- [x] `SESSION_SECRET` - 32+ character secret for JWT signing
- [x] `SESSION_COOKIE_NAME` - Cookie name (default: `anki_session`)
- [x] `SESSION_MAX_AGE` - Session duration in seconds (default: 604800 = 7 days)
- [x] `NEXT_PUBLIC_BACKEND_URL` - Backend API URL

**Backend** (Cloudflare Workers):
- [x] `OPENAI_API_KEY` - Required for question parsing
- [x] `OPENAI_MODEL` (optional) - Default: `gpt-4o-mini`
- [x] `GITHUB_TOKEN` (optional) - For higher rate limits

**Note:** Password uses `APP_PASSWORD_HASH_B64` (base64-encoded), not plain `APP_PASSWORD_HASH`

#### 6.2 Deployment configuration

**Current Status:** Deployment infrastructure is fully configured.

**Backend** (`backend/wrangler.toml`):
```toml
name = "anki-interview-app"
main = "src/index.ts"
compatibility_date = "2025-01-01"

[[d1_databases]]
binding = "DB"
database_name = "anki-interview-db"
database_id = "<your-dev-db-id>"

[env.production.d1_databases]
binding = "DB"
database_name = "anki-interview-db-prod"
database_id = "<your-prod-db-id>"
```

**Deployment commands:**

```bash
# Backend (Cloudflare Workers)
cd backend
wrangler deploy                    # Deploy API
pnpm db:migrate:prod               # Run migrations on production
pnpm run sync                      # Sync questions (CLI)

# Frontend (Cloudflare Pages)
cd frontend
pnpm pages:build                   # Build for Cloudflare
wrangler pages deploy              # Deploy

# Or use Cloudflare Pages GitHub integration for auto-deploy
```

#### 6.3 Post-deployment testing

**Currently Working:**
- [x] Can access login page
- [x] Can log in with credentials
- [x] All routes protected by auth (frontend middleware)
- [x] Study flow works end-to-end
- [x] Questions list loads with search/filter
- [x] Question detail pages work
- [x] Database persists across requests
- [x] Answer logging and difficulty tracking

**Not Yet Implemented:**
- [ ] Settings page exists
- [ ] Can sync questions from UI (currently CLI-only: `pnpm run sync`)
- [ ] Backend auth middleware (backend endpoints are currently public)

### 7. Future Enhancements

#### 7.1 Potential features

- [ ] Export answer history to CSV
- [ ] Clear all answer history (soft reset)
- [ ] Add custom questions manually
- [ ] Tag system for questions
- [ ] Study session statistics
- [ ] Spaced repetition algorithm
- [ ] Dark mode
- [ ] Mobile app (PWA)
- [ ] Email notifications for study reminders

#### 7.2 Performance optimizations

- [ ] Implement caching for question list
- [ ] Add pagination for large datasets
- [ ] Optimize database queries
- [ ] Lazy load answer text
- [ ] Service worker for offline support

## Success Criteria

**Currently Complete:**
- [x] Production deployment infrastructure ready (Cloudflare Pages + Workers + D1)
- [x] Sync logic implemented (CLI script in `backend/scripts/sync-github.ts`)
- [x] All core features working (auth, study, questions management)

**To Be Implemented (This Spec):**
- [ ] Settings page displays system status
- [ ] Settings page UI created at `frontend/src/app/settings/page.tsx`
- [ ] Backend `/api/sync` endpoint (expose sync as web API)
- [ ] Backend `/api/sync/status` endpoint
- [ ] Sync button functional from UI
- [ ] Sync results displayed in UI
- [ ] Configured sources listed in UI

**Optional Enhancements (v2):**
- [ ] Sync metadata table for history tracking
- [ ] Navigation component for consistent nav across pages
- [ ] Dashboard home page with stats
- [ ] Real-time sync progress updates

## Complete Application Checklist

### Core Features

- [x] User authentication (JWT + bcrypt)
- [x] GitHub sync (CLI script only - `pnpm run sync`)
- [x] Study flashcard flow with keyboard shortcuts
- [x] Question browsing with search/filter/pagination
- [ ] Settings management UI

### Database

- [x] D1 database setup
- [x] Migrations run (`0001_initial_schema.sql`)
- [x] Schema validated (`questions` and `answer_logs` tables)
- [ ] Sync metadata table (optional v2 feature)

### API Endpoints

**Frontend API Routes:**
- [x] POST `/api/login` - User authentication
- [x] POST `/api/logout` - Session cleanup
- [x] GET `/api/auth/session` - Session info
- [ ] POST `/api/sync` - Trigger GitHub sync (not implemented)
- [ ] GET `/api/sync/status` - Get sync status (not implemented)

**Backend API Endpoints** (Cloudflare Workers):
- [x] POST `/api/study/next` - Get random question
- [x] GET `/api/study/:id` - Get question with answer
- [x] POST `/api/study/:id/answer` - Submit answer rating
- [x] GET `/api/questions` - List questions (with filters/search/pagination)
- [x] GET `/api/questions/:id` - Get question details
- [x] GET `/api/questions/stats` - Get question statistics
- [x] GET `/health` - Health check

### Pages

- [x] `/login` - Authentication page
- [x] `/study` - Study flashcard interface
- [x] `/questions` - Question list with search/filter
- [x] `/questions/[id]` - Question detail page
- [x] `/` - Root (redirects to `/study`)
- [ ] `/settings` - Settings/admin page (not implemented)

### Security

- [x] Frontend middleware protection
- [x] Session management (JWT with HTTP-only cookies)
- [x] Secure cookies
- [x] Environment variables configured
- [ ] Backend auth middleware (backend endpoints currently public)

## Next Steps

**Current State:** Most features are implemented and deployed. Settings page is the primary remaining task.

**To Complete Settings Page:**

1. **Create Settings Page UI**
   - Implement `frontend/src/app/settings/page.tsx` using spec code as template
   - For MVP: Show system stats, configured sources, logout
   - Option A: Include sync button (requires backend API)
   - Option B: Show "Sync via CLI" message for now

2. **Backend API Endpoints (Optional)**
   - Create `/api/sync` endpoint to expose sync functionality
   - Create `/api/sync/status` endpoint for status display
   - Refactor `backend/scripts/sync-github.ts` logic into reusable function

3. **Testing**
   - Verify settings page loads and displays correctly
   - Test sync workflow (if implemented)
   - Verify navigation links work

4. **Monitor & Iterate**
   - Monitor OpenAI API usage during syncs
   - Collect user feedback
   - Consider automated sync (Cloudflare Cron Triggers)

## References

- [Cloudflare Pages](https://developers.cloudflare.com/pages/)
- [Next.js on Cloudflare](https://developers.cloudflare.com/pages/framework-guides/nextjs/)
- [D1 Database](https://developers.cloudflare.com/d1/)
- [OpenAI API](https://platform.openai.com/docs)
