# Settings & Admin Implementation Spec

## Overview

Implement the settings/admin page for syncing questions, managing configuration, and viewing system status. This document describes the implementation plan for adding a settings interface to the Anki Interview App, which is built on **Cloudflare infrastructure** (Workers + D1 + Pages).

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
- **Sync API Endpoints**: No `/api/sync`, `/api/sync/status`, or `/api/sync/history` endpoints
- **Global Navigation Component**: No unified navigation across pages
- **Sync Metadata Table**: No database tracking of sync history
- **Backend API Authentication**: Backend endpoints have no auth (rely on CORS only)

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
- [ ] GitHub sync API endpoints (currently only script exists)

## Implementation Tasks

### 1. Backend API Endpoints

The sync functionality currently exists as a standalone script (`backend/scripts/sync-github.ts`). To enable UI-triggered syncing, we need to create API endpoints.

#### 1.1 Create sync endpoint

**Location:** `backend/src/index.ts` (add to existing Hono app)

```typescript
import { syncAllSources } from './lib/sync';
import { getAllSources } from './config/sources';

/**
 * POST /api/sync
 * Trigger GitHub sync for all configured sources
 */
app.post('/api/sync', async (c) => {
  try {
    const db = c.env.DB;
    const openaiApiKey = c.env.OPENAI_API_KEY;

    if (!openaiApiKey) {
      return c.json(
        { error: 'OPENAI_API_KEY not configured' },
        500
      );
    }

    const results = await syncAllSources(db, openaiApiKey);

    return c.json({
      success: true,
      results,
      totals: {
        inserted: results.reduce((sum, r) => sum + r.inserted, 0),
        updated: results.reduce((sum, r) => sum + r.updated, 0),
        total: results.reduce((sum, r) => sum + r.total, 0),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Sync error:', error);
    return c.json(
      {
        error: 'Failed to sync questions',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});
```

**Note:** This requires extracting the sync logic from `scripts/sync-github.ts` into a reusable library function.

#### 1.2 Create sync status endpoint

**Location:** `backend/src/index.ts`

```typescript
/**
 * GET /api/sync/status
 * Get current sync status and question count
 */
app.get('/api/sync/status', async (c) => {
  try {
    const db = c.env.DB;

    // Get total question count
    const { count } = await db
      .prepare('SELECT COUNT(*) as count FROM questions')
      .first<{ count: number }>();

    // Get last sync time (from most recently updated question)
    const lastSync = await db
      .prepare(
        `SELECT updated_at
         FROM questions
         ORDER BY updated_at DESC
         LIMIT 1`
      )
      .first<{ updated_at: string }>();

    return c.json({
      totalQuestions: count || 0,
      lastSync: lastSync?.updated_at || null,
    });
  } catch (error) {
    console.error('Status error:', error);
    return c.json({ error: 'Failed to get sync status' }, 500);
  }
});
```

#### 1.3 Add sync metadata tracking (Optional)

To track sync history, add a new migration and table:

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

- [ ] POST /api/sync triggers GitHub sync
- [ ] GET /api/sync/status returns question count and last sync time
- [ ] GET /api/sync/history returns sync history (if metadata table added)
- [ ] Error handling for missing API keys
- [ ] CORS configured to allow frontend requests

### 2. Frontend API Routes (Proxy Layer)

Since the frontend runs on Cloudflare Pages and the backend runs on Cloudflare Workers, we need to proxy sync requests through frontend API routes to add authentication.

#### 2.1 Create sync proxy endpoint

**Location:** `frontend/src/app/api/sync/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';

export const runtime = 'edge';

const BACKEND_URL = process.env.BACKEND_API_URL || 'http://localhost:8787';

export async function POST() {
  try {
    // Require authentication
    await requireSession();

    // Forward to backend
    const response = await fetch(`${BACKEND_URL}/api/sync`, {
      method: 'POST',
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.error('Sync proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to sync questions' },
      { status: 500 }
    );
  }
}
```

#### 2.2 Create sync status proxy endpoint

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

#### 2.3 Environment variables

Add to `frontend/.env.local`:

```bash
BACKEND_API_URL=http://localhost:8787
```

Add to Cloudflare Pages environment variables:

```bash
BACKEND_API_URL=https://anki-interview-app.your-worker.workers.dev
```

**Acceptance Criteria:**

- [ ] Frontend API routes proxy to backend
- [ ] Authentication required for sync operations
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
      if (response.ok) {
        const data = await response.json();
        setStatus(data);
      }
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
            Sync interview questions from configured GitHub repositories. This
            uses OpenAI to parse questions from markdown files.
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

- [ ] Displays system status (question count, last sync)
- [ ] Sync button triggers GitHub sync
- [ ] Shows sync progress/loading state
- [ ] Displays sync results with details per source
- [ ] Shows configured sources (JavaScript Interview Questions)
- [ ] Logout button present
- [ ] Error handling for sync failures
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
curl -X POST http://localhost:8787/api/sync
```

#### 6.2 Frontend testing

```bash
# Start frontend locally
cd frontend
pnpm dev

# Test in browser
# 1. Navigate to http://localhost:3000/settings
# 2. Click "Sync from GitHub"
# 3. Verify loading state appears
# 4. Verify success message shows
# 5. Verify question count updates
```

#### 6.3 Manual testing checklist

**Settings page:**

- [ ] Navigate to /settings
- [ ] System status displays correctly
- [ ] Click "Sync from GitHub" → sync runs
- [ ] Loading state shows during sync
- [ ] Success message appears after sync
- [ ] Question count updates after sync
- [ ] Last sync time updates
- [ ] Error handling works for sync failures
- [ ] Configured sources listed (JavaScript Interview Questions)
- [ ] Logout button works

**Navigation (if implemented):**

- [ ] Navigation appears on all pages
- [ ] Active page highlighted
- [ ] All links work
- [ ] Responsive on mobile

**Integration:**

- [ ] Can log in successfully
- [ ] Settings page requires authentication
- [ ] Sync requires authentication
- [ ] Can sync questions and study them immediately
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
- [ ] Can trigger sync from UI
- [ ] Sync completes successfully
- [ ] Questions appear in study flow
- [ ] All navigation works

## Success Criteria

### Minimum Viable Settings Page

- [ ] Settings page exists and is accessible
- [ ] Displays total question count
- [ ] Shows last sync timestamp
- [ ] Manual sync button triggers GitHub sync
- [ ] Sync results displayed to user
- [ ] Error handling for sync failures
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

### Sync: Script vs. API?

- **Current**: Standalone script (`pnpm sync`) - good for cron jobs
- **Proposed**: API endpoint - enables UI-triggered sync
- **Recommendation**: Support both. Keep script for automation, add API for convenience.

## Future Enhancements

### Near-term
- [ ] Add more question sources to `sources.ts`
- [ ] Implement "Clear All Answer History" button
- [ ] Add manual question creation form
- [ ] Display sync progress percentage

### Long-term
- [ ] Schedule automatic syncs (Cloudflare Cron Triggers)
- [ ] Email notifications for sync failures
- [ ] Question approval workflow (review before adding)
- [ ] Custom parsing rules per source
- [ ] Export questions to JSON/CSV
- [ ] Import questions from CSV

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
