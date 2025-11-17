# Settings & Admin Implementation Spec

## Overview

Implement the settings/admin page for syncing questions, managing configuration, and viewing system status.

## Prerequisites

- Database setup completed
- Authentication implemented
- GitHub sync API implemented

## Features

1. **Manual GitHub Sync** - Trigger sync from UI
2. **Sync Status** - View last sync time and results
3. **Question Count** - See total questions in database
4. **Source Management** - View configured sources
5. **Account Management** - Logout functionality

## Implementation Tasks

### 1. Settings Page UI

#### 1.1 Create settings page

**Location:** `/src/app/settings/page.tsx`

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

**Acceptance Criteria:**

- [ ] Displays system status (question count, last sync)
- [ ] Sync button triggers GitHub sync
- [ ] Shows sync progress/loading state
- [ ] Displays sync results
- [ ] Shows configured sources
- [ ] Logout button present
- [ ] Error handling for sync failures

### 2. Enhanced Status Tracking

#### 2.1 Add sync metadata table (optional)

**Location:** `/db/migrations/0002_sync_metadata.sql`

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

#### 2.2 Sync history endpoint

**Location:** `/src/app/api/sync/history/route.ts`

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

### 3. Navigation Component

#### 3.1 Create global navigation

**Location:** `/src/components/Navigation.tsx`

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

### 4. Home Page / Dashboard

#### 4.1 Create home page

**Location:** `/src/app/page.tsx`

```typescript
import { redirect } from "next/navigation";

export default function HomePage() {
  // Redirect to study page by default
  redirect("/study");
}
```

**Or create a dashboard:**

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

Ensure these are set in Cloudflare:

- [ ] `APP_USERNAME`
- [ ] `APP_PASSWORD_HASH`
- [ ] `SESSION_SECRET`
- [ ] `OPENAI_API_KEY`
- [ ] `OPENAI_MODEL` (optional)
- [ ] `GITHUB_TOKEN` (optional)

#### 6.2 Deployment configuration

**wrangler.toml:**

```toml
name = "anki-interview-app"
compatibility_date = "2024-01-01"

[build]
command = "npm run build"

[[d1_databases]]
binding = "DB"
database_name = "anki-interview-db"
database_id = "..." # Your database ID

[env.production]
[[env.production.d1_databases]]
binding = "DB"
database_name = "anki-interview-db-prod"
database_id = "..." # Your production database ID
```

**Deployment commands:**

```bash
# Build and deploy
npm run build
npx wrangler pages deploy

# Or use Cloudflare Pages GitHub integration
```

#### 6.3 Post-deployment testing

- [ ] Can access login page
- [ ] Can log in with credentials
- [ ] All routes protected by auth
- [ ] Can sync questions from GitHub
- [ ] Study flow works end-to-end
- [ ] Questions list loads
- [ ] Question detail pages work
- [ ] Settings page functional
- [ ] Database persists across requests

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

- [x] Settings page displays system status
- [x] Sync button functional
- [x] Sync results displayed
- [x] Configured sources listed
- [x] Navigation component works
- [x] Home page/dashboard created
- [x] All pages have consistent navigation
- [x] Logout accessible from all pages
- [x] Production deployment ready

## Complete Application Checklist

### Core Features

- [x] User authentication
- [x] GitHub sync
- [x] Study flashcard flow
- [x] Question browsing
- [x] Settings management

### Database

- [x] D1 database setup
- [x] Migrations run
- [x] Schema validated

### API Endpoints

- [x] POST /api/login
- [x] POST /api/logout
- [x] POST /api/sync
- [x] GET /api/sync/status
- [x] POST /api/study/next
- [x] POST /api/study/[id]/answer
- [x] GET /api/questions
- [x] GET /api/questions/[id]
- [x] GET /api/questions/stats

### Pages

- [x] /login
- [x] /study
- [x] /questions
- [x] /questions/[id]
- [x] /settings

### Security

- [x] Middleware protection
- [x] Session management
- [x] Secure cookies
- [x] Environment variables

## Next Steps

After completing all specs:

1. Begin implementation following each spec in order
2. Test each component before moving to next
3. Deploy to Cloudflare Pages
4. Monitor OpenAI API usage
5. Collect feedback and iterate

## References

- [Cloudflare Pages](https://developers.cloudflare.com/pages/)
- [Next.js on Cloudflare](https://developers.cloudflare.com/pages/framework-guides/nextjs/)
- [D1 Database](https://developers.cloudflare.com/d1/)
- [OpenAI API](https://platform.openai.com/docs)
