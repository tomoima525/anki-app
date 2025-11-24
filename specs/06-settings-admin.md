# Settings & Admin Implementation Spec

## Overview

Implement the settings/admin page for monitoring sync status, managing configuration, and viewing system status. This document describes the implementation plan for adding a settings interface to the Anki Interview App, which is built on **Cloudflare infrastructure** (Workers + D1 + Pages).

**Key Design Decision**: GitHub sync runs as an **asynchronous batch job** that can be triggered via API (POST `/api/sync`) or scheduled via cron. The sync executes in the background using Cloudflare Queues or `ctx.waitUntil()` to avoid HTTP timeouts. The settings page monitors progress by polling the `/api/sync/status` endpoint.

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
- **Sync API Endpoints**: No `/api/sync` (POST), `/api/sync/status`, or `/api/sync/history` endpoints
- **Async Job Infrastructure**: No Cloudflare Queue or background job handling configured
- **Global Navigation Component**: No unified navigation across pages
- **Sync Metadata Table**: No database tracking of sync history
- **Backend API Authentication**: Backend endpoints have no auth (rely on CORS only)

**Note**: Manual sync via CLI (`pnpm sync`) already works, but needs API endpoint for UI-triggered execution.

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
- [ ] Async job infrastructure (Cloudflare Queues or ctx.waitUntil)
- [ ] Sync metadata table for tracking job executions
- [ ] Optional: Cron trigger for scheduled automatic syncs

## Implementation Tasks

### 1. Backend API Endpoints

The sync functionality exists as a standalone script (`backend/scripts/sync-github.ts`) and should be exposed as an API endpoint that executes **asynchronously** to avoid HTTP timeouts. The sync process involves fetching from GitHub, parsing with OpenAI, and updating the database, which can take several minutes to complete.

#### 1.1 Create async sync trigger endpoint

**Location:** `backend/src/index.ts`

**Approach: Using Cloudflare Queues (Recommended)**

First, configure a queue in `backend/wrangler.toml`:

```toml
[[queues.producers]]
queue = "sync-queue"
binding = "SYNC_QUEUE"

[[queues.consumers]]
queue = "sync-queue"
max_batch_size = 1
max_retries = 2
dead_letter_queue = "sync-dlq"
```

Create the sync endpoint:

```typescript
import { syncAllSources } from "./lib/sync";

/**
 * POST /api/sync
 * Trigger async GitHub sync using Cloudflare Queues
 */
app.post("/api/sync", async (c) => {
  try {
    const db = c.env.DB;

    // Check if a sync is already running
    const runningSync = await db
      .prepare(
        `SELECT id FROM sync_metadata WHERE status = 'running' ORDER BY started_at DESC LIMIT 1`
      )
      .first<{ id: number }>();

    if (runningSync) {
      return c.json({ error: "A sync is already in progress" }, 409);
    }

    // Create metadata record with 'running' status
    const syncRecord = await db
      .prepare(
        `INSERT INTO sync_metadata (started_at, status)
         VALUES (?, 'running')
         RETURNING id`
      )
      .bind(new Date().toISOString())
      .first<{ id: number }>();

    // Send sync job to queue
    await c.env.SYNC_QUEUE.send({
      syncId: syncRecord.id,
      timestamp: new Date().toISOString(),
    });

    return c.json({
      success: true,
      message: "Sync job queued",
      syncId: syncRecord.id,
    });
  } catch (error) {
    console.error("Sync trigger error:", error);
    return c.json(
      {
        error: "Failed to trigger sync",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});
```

Create the queue consumer:

```typescript
/**
 * Queue consumer for processing sync jobs
 */
export default {
  async queue(batch: MessageBatch, env: Env, ctx: ExecutionContext) {
    for (const message of batch.messages) {
      const { syncId } = message.body;

      try {
        console.log(`Processing sync job ${syncId}...`);

        const results = await syncAllSources(env.DB, env.OPENAI_API_KEY);

        // Update metadata with success
        await env.DB.prepare(
          `UPDATE sync_metadata
           SET completed_at = ?,
               status = 'completed',
               questions_inserted = ?,
               questions_updated = ?
           WHERE id = ?`
        )
          .bind(
            new Date().toISOString(),
            results.reduce((sum, r) => sum + r.inserted, 0),
            results.reduce((sum, r) => sum + r.updated, 0),
            syncId
          )
          .run();

        message.ack();
        console.log(`Sync job ${syncId} completed successfully`);
      } catch (error) {
        console.error(`Sync job ${syncId} failed:`, error);

        // Update metadata with failure
        await env.DB.prepare(
          `UPDATE sync_metadata
           SET completed_at = ?,
               status = 'failed',
               error_message = ?
           WHERE id = ?`
        )
          .bind(
            new Date().toISOString(),
            error instanceof Error ? error.message : "Unknown error",
            syncId
          )
          .run();

        message.retry();
      }
    }
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return app.fetch(request, env, ctx);
  },
};
```

**Alternative Approach: Using ctx.waitUntil() (Simpler, but limited)**

If you don't want to set up queues, you can use `ctx.waitUntil()`, but note that this has time limits (30s for free tier, up to 15 minutes for paid):

```typescript
app.post("/api/sync", async (c) => {
  try {
    const db = c.env.DB;

    // Check if sync already running
    const runningSync = await db
      .prepare(`SELECT id FROM sync_metadata WHERE status = 'running' LIMIT 1`)
      .first<{ id: number }>();

    if (runningSync) {
      return c.json({ error: "A sync is already in progress" }, 409);
    }

    // Create metadata record
    const syncRecord = await db
      .prepare(
        `INSERT INTO sync_metadata (started_at, status)
         VALUES (?, 'running')
         RETURNING id`
      )
      .bind(new Date().toISOString())
      .first<{ id: number }>();

    // Run sync in background using waitUntil
    c.executionCtx.waitUntil(
      (async () => {
        try {
          const results = await syncAllSources(db, c.env.OPENAI_API_KEY);

          await db
            .prepare(
              `UPDATE sync_metadata
             SET completed_at = ?, status = 'completed',
                 questions_inserted = ?, questions_updated = ?
             WHERE id = ?`
            )
            .bind(
              new Date().toISOString(),
              results.reduce((sum, r) => sum + r.inserted, 0),
              results.reduce((sum, r) => sum + r.updated, 0),
              syncRecord.id
            )
            .run();
        } catch (error) {
          await db
            .prepare(
              `UPDATE sync_metadata
             SET completed_at = ?, status = 'failed', error_message = ?
             WHERE id = ?`
            )
            .bind(
              new Date().toISOString(),
              error instanceof Error ? error.message : "Unknown error",
              syncRecord.id
            )
            .run();
        }
      })()
    );

    return c.json({
      success: true,
      message: "Sync started",
      syncId: syncRecord.id,
    });
  } catch (error) {
    console.error("Sync trigger error:", error);
    return c.json({ error: "Failed to trigger sync" }, 500);
  }
});
```

**Note:** Extract sync logic from `scripts/sync-github.ts` into a reusable `lib/sync.ts` module.

#### 1.2 Create sync status endpoint

The status endpoint provides real-time information about sync progress. The frontend polls this endpoint to monitor ongoing sync operations.

**Location:** `backend/src/index.ts`

```typescript
/**
 * GET /api/sync/status
 * Get current sync status and question count
 * This is a read-only endpoint - sync runs as a batch job
 */
app.get("/api/sync/status", async (c) => {
  try {
    const db = c.env.DB;

    // Get total question count
    const { count } = await db
      .prepare("SELECT COUNT(*) as count FROM questions")
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
    console.error("Status error:", error);
    return c.json({ error: "Failed to get sync status" }, 500);
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
    .bind(new Date().toISOString(), error.message, syncRecord.id)
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
app.get("/api/sync/history", async (c) => {
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
    console.error("History error:", error);
    return c.json({ error: "Failed to get sync history" }, 500);
  }
});
```

**Acceptance Criteria:**

- [ ] POST /api/sync triggers async sync job (via Queue or waitUntil)
- [ ] POST /api/sync prevents concurrent syncs (returns 409 if already running)
- [ ] Async job executes without blocking HTTP request
- [ ] GET /api/sync/status returns question count, last sync time, and running status
- [ ] GET /api/sync/history returns sync history from metadata table
- [ ] Sync metadata table tracks all sync executions (success/failure)
- [ ] Error handling for missing API keys and sync failures
- [ ] CORS configured to allow frontend requests

### 2. Frontend API Routes (Proxy Layer)

Since the frontend runs on Cloudflare Pages and the backend runs on Cloudflare Workers, we need to proxy sync requests through frontend API routes to add authentication.

#### 2.1 Create sync trigger proxy endpoint

**Location:** `frontend/src/app/api/sync/route.ts`

```typescript
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";

export const runtime = "edge";

const BACKEND_URL = process.env.BACKEND_API_URL || "http://localhost:8787";

export async function POST() {
  try {
    // Require authentication
    await requireSession();

    // Forward to backend
    const response = await fetch(`${BACKEND_URL}/api/sync`, {
      method: "POST",
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.error("Sync proxy error:", error);
    return NextResponse.json(
      { error: "Failed to trigger sync" },
      { status: 500 }
    );
  }
}
```

#### 2.2 Create sync status proxy endpoint

**Location:** `frontend/src/app/api/sync/status/route.ts`

```typescript
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";

export const runtime = "edge";

const BACKEND_URL = process.env.BACKEND_API_URL || "http://localhost:8787";

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
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(
      { error: "Failed to get sync status" },
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

- [ ] Frontend API routes proxy sync trigger and status requests to backend
- [ ] Authentication required for triggering sync and viewing status
- [ ] POST /api/sync returns sync job ID and success message
- [ ] GET /api/sync/status returns current sync state
- [ ] Error handling for backend failures and concurrent sync attempts
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
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadStatus();
    // Poll status every 5 seconds when syncing, 30 seconds when idle
    const interval = setInterval(
      loadStatus,
      status?.isRunning ? 5000 : 30000
    );
    return () => clearInterval(interval);
  }, [status?.isRunning]);

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

  const handleSync = async () => {
    setSyncing(true);
    setError(null);

    try {
      const response = await fetch('/api/sync', {
        method: 'POST',
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 409) {
          setError('A sync is already in progress');
        } else {
          setError(data.error || 'Failed to start sync');
        }
        return;
      }

      // Start polling for status updates
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
            Sync interview questions from configured GitHub repositories. The sync
            process uses OpenAI to parse questions from markdown files and runs
            asynchronously in the background.
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
                  <div className="text-xs mt-1">
                    This page will auto-refresh to show progress...
                  </div>
                </div>
              </div>
            </div>
          )}

          <button
            onClick={handleSync}
            disabled={syncing || status?.isRunning}
            className="w-full md:w-auto px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {syncing
              ? 'Starting...'
              : status?.isRunning
              ? 'Sync Running...'
              : 'Sync from GitHub'}
          </button>

          {syncing && (
            <div className="mt-4 text-sm text-gray-600">
              Starting sync job. Please wait...
            </div>
          )}

          <p className="mt-4 text-sm text-gray-500">
            For command line sync:{' '}
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
- [ ] "Sync from GitHub" button triggers sync via POST /api/sync
- [ ] Button disabled when sync is already running
- [ ] Auto-refreshes status every 5 seconds when syncing, 30 seconds when idle
- [ ] Shows "Syncing..." indicator with spinner when job is running
- [ ] Displays last sync results (inserted/updated counts)
- [ ] Shows configured sources (JavaScript Interview Questions)
- [ ] Includes instructions for manual CLI sync
- [ ] Logout button present
- [ ] Error handling for sync failures and concurrent sync attempts
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
GOOGLE_CLIENT_ID=<google-oauth-client-id>
GOOGLE_CLIENT_SECRET=<google-oauth-client-secret>
SESSION_SECRET=<random-32-char-string>
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini  # Optional, defaults to gpt-4o-mini
GITHUB_TOKEN=ghp_...      # Optional, for higher rate limits
```

#### 5.2 Frontend environment variables

**Cloudflare Pages** (set via dashboard):

```bash
NEXT_PUBLIC_GOOGLE_CLIENT_ID=<google-oauth-client-id>
GOOGLE_CLIENT_ID=<google-oauth-client-id>
GOOGLE_CLIENT_SECRET=<google-oauth-client-secret>
SESSION_SECRET=<same-as-backend>
SESSION_COOKIE_NAME=anki_session
SESSION_MAX_AGE=604800
BACKEND_API_URL=https://anki-interview-app.your-worker.workers.dev
```

**Development** (`.env.local`):

```bash
NEXT_PUBLIC_GOOGLE_CLIENT_ID=<google-oauth-client-id>
GOOGLE_CLIENT_ID=<google-oauth-client-id>
GOOGLE_CLIENT_SECRET=<google-oauth-client-secret>
SESSION_SECRET=<random-32-char-string>
SESSION_COOKIE_NAME=anki_session
SESSION_MAX_AGE=604800
BACKEND_API_URL=http://localhost:8787
```

#### 5.3 Google OAuth Setup

1. Create a project in [Google Cloud Console](https://console.cloud.google.com/)
2. Enable Google+ API
3. Create OAuth 2.0 credentials
4. Add authorized redirect URIs:
   - Development: `http://localhost:3000/api/auth/callback/google`
   - Production: `https://your-domain.com/api/auth/callback/google`
5. Copy Client ID and Client Secret to environment variables

**Acceptance Criteria:**

- [ ] All required environment variables documented
- [ ] Backend secrets configured in Cloudflare Workers
- [ ] Frontend env vars configured in Cloudflare Pages
- [ ] Google OAuth credentials configured
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

# Trigger sync via API
curl -X POST http://localhost:8787/api/sync

# Monitor status
watch -n 2 'curl http://localhost:8787/api/sync/status'

# Check sync history
curl http://localhost:8787/api/sync/history

# Test concurrent sync prevention
curl -X POST http://localhost:8787/api/sync  # Should return 409 if already running
```

#### 6.2 Frontend testing

```bash
# Start frontend locally
cd frontend
pnpm dev

# Test in browser
# 1. Navigate to http://localhost:3000/settings
# 2. Verify system status displays (question count, last sync, status)
# 3. Click "Sync from GitHub" button
# 4. Verify button changes to "Sync Running..." and is disabled
# 5. Verify "Syncing..." indicator appears with spinner
# 6. Verify page polls status every 5 seconds (check network tab)
# 7. Wait for sync to complete
# 8. Verify status updates to "Idle" and question count increases
# 9. Try clicking sync button again while sync is running (should show error)
```

#### 6.3 Manual testing checklist

**Settings page:**

- [ ] Navigate to /settings
- [ ] System status displays correctly (question count, last sync time, status)
- [ ] "Sync from GitHub" button visible and enabled when idle
- [ ] Click sync button → sync starts
- [ ] Button changes to "Sync Running..." and is disabled during sync
- [ ] "Syncing..." indicator appears with animated spinner
- [ ] Status polls every 5 seconds during sync (check network tab)
- [ ] Status polls every 30 seconds when idle
- [ ] When sync is running, shows yellow pulsing status indicator
- [ ] When sync is idle, shows green "Idle" status
- [ ] Last sync results show inserted/updated counts
- [ ] Trying to start concurrent sync shows error message
- [ ] After sync completes, button re-enables and status updates
- [ ] Question count updates after successful sync
- [ ] CLI sync instructions displayed
- [ ] Configured sources listed (JavaScript Interview Questions)
- [ ] Logout button works
- [ ] Error handling works for sync failures and status fetch failures

**Navigation (if implemented):**

- [ ] Navigation appears on all pages
- [ ] Active page highlighted
- [ ] All links work
- [ ] Responsive on mobile

**Integration:**

- [ ] Can log in successfully
- [ ] Settings page requires authentication
- [ ] Sync trigger endpoint requires authentication
- [ ] Status endpoint requires authentication
- [ ] Sync job runs asynchronously without blocking UI
- [ ] Questions synced via API appear in study flow immediately after completion
- [ ] Answer tracking works after sync
- [ ] Concurrent sync attempts properly prevented (409 error)

### 7. Deployment

#### 7.1 Deploy backend

```bash
cd backend

# Create Cloudflare Queue (if using queue approach)
npx wrangler queues create sync-queue
npx wrangler queues create sync-dlq  # Dead letter queue

# Run production migration (add sync_metadata table)
npx wrangler d1 migrations apply anki-interview-db-prod --remote

# Deploy to production
pnpm deploy

# Or manually
npx wrangler deploy
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
- [ ] Click "Sync from GitHub" button → sync triggers
- [ ] Sync runs asynchronously (page remains responsive)
- [ ] Status updates during sync (poll every 5 seconds)
- [ ] Queue processes job successfully (check Cloudflare dashboard)
- [ ] Concurrent sync prevented (try clicking button twice)
- [ ] Questions appear in study flow after sync completes
- [ ] All navigation works
- [ ] Optional: Verify cron trigger if configured for scheduled syncs

## Success Criteria

### Minimum Viable Settings Page

- [ ] Settings page exists and is accessible
- [ ] Displays total question count
- [ ] Shows last sync timestamp and results
- [ ] Shows current sync status (idle/syncing)
- [ ] "Sync from GitHub" button triggers async sync via API
- [ ] Button disabled during sync to prevent concurrent runs
- [ ] Auto-refreshes status to show real-time progress (5s when syncing, 30s when idle)
- [ ] Async job infrastructure configured (Queues or waitUntil)
- [ ] Includes CLI sync instructions for manual execution
- [ ] Error handling for sync failures, concurrent attempts, and status fetch failures
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

### Sync: Async API vs. Real-time Blocking?

- **Problem**: GitHub sync takes several minutes and involves multiple external API calls (GitHub, OpenAI)
- **Blocking approach**: Synchronous POST /api/sync that waits for completion
  - ❌ Long execution time causes HTTP timeouts
  - ❌ Blocks Workers request duration limits (30s free, 15min paid)
  - ❌ Poor user experience (user waits several minutes for response)
- **Async API approach**: POST /api/sync triggers background job, returns immediately
  - ✅ API responds immediately with job ID
  - ✅ Runs asynchronously without blocking HTTP request
  - ✅ No timeout concerns (job runs independently)
  - ✅ Can be monitored in real-time via polling status endpoint
  - ✅ User can trigger on-demand from UI
  - ✅ Prevents concurrent syncs (409 error if already running)
- **Decision**: Use async API approach
  - POST /api/sync triggers async job (Cloudflare Queues or ctx.waitUntil)
  - GET /api/sync/status for monitoring progress
  - Frontend polls status every 5 seconds during sync
  - Optional: Add Cloudflare Cron Triggers for scheduled automatic syncs
  - CLI script (`pnpm sync`) remains available for direct execution

## Future Enhancements

### Near-term

- [ ] Add more question sources to `sources.ts`
- [ ] Implement "Clear All Answer History" button
- [ ] Add manual question creation form
- [ ] Display detailed sync history with per-source results
- [ ] Show sync progress bar or percentage (requires periodic status updates in queue consumer)
- [ ] Add Cloudflare Cron Trigger for automatic scheduled syncs (e.g., daily at 2 AM UTC)
- [ ] Cancel running sync functionality

### Long-term

- [ ] Email/webhook notifications for sync failures
- [ ] Slack integration for sync status updates
- [ ] Real-time sync progress using WebSockets or Server-Sent Events
- [ ] Sync specific sources on-demand (not all sources at once)
- [ ] Question approval workflow (review before adding)
- [ ] Custom parsing rules per source
- [ ] Export questions to JSON/CSV
- [ ] Import questions from CSV
- [ ] Configure sync schedule from UI (instead of hardcoded cron)

## References

- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Cloudflare Queues Docs](https://developers.cloudflare.com/queues/)
- [Cloudflare D1 Docs](https://developers.cloudflare.com/d1/)
- [Cloudflare Pages Docs](https://developers.cloudflare.com/pages/)
- [Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
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
