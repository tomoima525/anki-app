# Anki Interview App - Infrastructure Analysis
## Current Implementation vs Specification

### Executive Summary
The anki-app is a Next.js + Cloudflare Workers full-stack application for spaced repetition learning of interview questions. The current implementation covers the core features (study, questions management, authentication) but **settings/admin features are partially not implemented yet**.

---

## 1. OVERALL ARCHITECTURE

### Deployment Infrastructure
- **Frontend**: Next.js 15 App Router deployed on Cloudflare Pages
- **Backend**: Cloudflare Workers API (Hono framework)
- **Database**: Cloudflare D1 (SQLite)
- **Package Manager**: pnpm with monorepo workspace

### Tech Stack
**Frontend:**
- Next.js 15
- Tailwind CSS 4
- JWT authentication with HTTP-only cookies (jose library)
- bcrypt for password hashing

**Backend:**
- Cloudflare Workers (serverless compute)
- Hono (lightweight routing framework)
- Octokit for GitHub API
- OpenAI API for question parsing

**Database:**
- SQLite (Cloudflare D1)
- Simple schema: `questions` and `answer_logs` tables
- SHA-256 hash-based question IDs

---

## 2. DATABASE SCHEMA & MIGRATIONS

### Current Schema
Located at: `/backend/db/schema.sql` and `/backend/db/migrations/0001_initial_schema.sql`

**Tables:**
1. **questions**
   - `id` (TEXT PRIMARY KEY) - SHA256 hash of question_text
   - `question_text` (TEXT NOT NULL)
   - `answer_text` (TEXT NOT NULL)
   - `source` (TEXT NOT NULL) - GitHub file path
   - `created_at` (DATETIME)
   - `updated_at` (DATETIME)
   - `last_answered_at` (DATETIME)
   - `last_difficulty` (TEXT) - 'easy', 'medium', 'hard'
   - `answer_count` (INTEGER DEFAULT 0)

2. **answer_logs**
   - `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
   - `question_id` (TEXT FOREIGN KEY)
   - `difficulty` (TEXT) - 'easy', 'medium', 'hard'
   - `answered_at` (DATETIME)

**Indexes:**
- `idx_questions_last_answered` - for quick sorting by recency
- `idx_questions_last_difficulty` - for difficulty filtering
- `idx_answer_logs_question_id` - for answer history lookups
- `idx_answer_logs_answered_at` - for recent activity queries

### What's NOT in Database (from spec)
- ❌ `sync_metadata` table (spec section 2.1) - for tracking sync history
- ❌ Sync status/history tracking

---

## 3. BACKEND API IMPLEMENTATION

### Currently Implemented Endpoints

**Study Endpoints:**
- `POST /api/study/next` - Get a random question for study
- `GET /api/study/:id` - Get question with answer
- `POST /api/study/:id/answer` - Submit answer with difficulty rating

**Question Management Endpoints:**
- `GET /api/questions` - List questions with filters, search, pagination
- `GET /api/questions/:id` - Get question details with answer history
- `GET /api/questions/stats` - Get statistics (total, answered, difficulty distribution, recent activity)

**Health Check:**
- `GET /health` - Service health check

### What's NOT Implemented (from spec)

#### Section: Settings & Admin (from 06-settings-admin.md)
❌ **Manual Sync API**
- `POST /api/sync` - Trigger manual GitHub sync
- Would need to call backend sync logic and return results

❌ **Sync Status Endpoints**
- `GET /api/sync/status` - Get last sync time and question count
- `GET /api/sync/history` - Get sync history

❌ **Authentication Required Endpoints**
- Current backend has no auth middleware - all endpoints are public
- No session verification on backend API calls

### Sync Implementation Status

**What EXISTS:**
- `/backend/scripts/sync-github.ts` - Standalone sync script (not exposed as API)
- Can be run with: `pnpm run sync:local` or `pnpm run sync`
- Fetches from GitHub, parses with OpenAI, upserts to database
- Works but is LOCAL ONLY (not a web API)

**What DOESN'T EXIST:**
- No API endpoint to trigger sync from UI
- No way for frontend to call sync programmatically
- Sync is a CLI tool, not a service

---

## 4. FRONTEND IMPLEMENTATION

### Currently Implemented Pages

**`/login`** ✓
- Single-user authentication
- Username/password form
- Sets JWT in HTTP-only cookie
- Redirects to `/study` on success

**`/study`** ✓
- Main study interface
- Fetches questions from backend
- Shows question, then answer on demand
- Records difficulty rating
- Keyboard shortcuts (Space to reveal, 1/2/3 for difficulty)
- Error handling for no questions

**`/questions`** ✓
- Lists all questions in paginated table
- Search functionality
- Difficulty filter
- Sort options (recent, oldest, most answered, least answered)
- Shows stats (total, answered, difficulty distribution)
- Link to question details page

**`/questions/[id]`** 
- Question detail page
- Shows question and answer
- Shows answer history
- Can view full details

**`/` (Root)** ✓
- Currently just redirects to `/study`

### NOT Implemented Pages

❌ **`/settings`** (from 06-settings-admin.md)
- Entire page missing
- Spec includes detailed UI for:
  - System status (question count, last sync)
  - GitHub sync button
  - Sync progress/loading state
  - Sync results display
  - Configured sources list
  - Account/logout section
  - Advanced options placeholder

❌ **Navigation Component** (from 06-settings-admin.md section 3)
- Spec includes global navigation bar
- Should show links to Study/Questions/Settings
- Should highlight active page
- Would go in layout or top-level

❌ **Dashboard/Home Page** (from 06-settings-admin.md section 4)
- Spec shows detailed dashboard design
- Should show stats, quick action links
- Currently just a redirect

### API Routes (Frontend)

**`/api/login`** ✓
- POST endpoint
- Verifies credentials
- Creates JWT session
- Sets HTTP-only cookie

**`/api/logout`** ✓
- POST endpoint
- Clears session cookie

**`/api/auth/session`** ✓
- GET endpoint
- Returns current session info

❌ **`/api/sync`** 
- NOT IMPLEMENTED
- Frontend study page shows error: "Please sync questions first"
- No way to trigger sync from UI

❌ **`/api/sync/status`** 
- NOT IMPLEMENTED
- Settings page would need this

---

## 5. SYNC MECHANISM - Deep Dive

### Current Architecture: LOCAL SCRIPT ONLY

The sync is implemented as a **standalone Node.js script**, not as a web service:

**File:** `/backend/scripts/sync-github.ts`

**How it works:**
1. Reads configured sources from `/backend/src/config/sources.ts`
2. For each source:
   - Uses Octokit to fetch markdown from GitHub
   - Sends content to OpenAI API for parsing
   - Upserts parsed questions to D1 database
3. Outputs detailed progress logs
4. Returns JSON with results

**How to run:**
```bash
cd backend
pnpm run sync:local      # Test against local database
pnpm run sync            # Sync against production database
```

**Dependencies:**
- `/backend/src/lib/github.ts` - GitHub fetching
- `/backend/src/lib/openai-parser.ts` - OpenAI parsing
- `/backend/src/lib/questions.ts` - Database upsert logic
- `/backend/src/config/sources.ts` - Source configuration

### What the Spec Expected

From `03-github-sync.md` and `06-settings-admin.md`:
- Sync could be triggered manually from Settings UI
- Would show progress/status
- Would track sync history in database
- Would display sync results on frontend

### The Gap

❌ **No Web API for Sync**
- Sync script exists but is CLI-only
- No `/api/sync` endpoint to call it
- Frontend has no way to trigger it

❌ **No Sync History Tracking**
- No `sync_metadata` table
- No record of past syncs
- Can't see "last sync" time on settings page

❌ **No Real-time Status**
- Sync runs to completion (can be slow if many questions)
- No progress updates
- Frontend would block waiting for response

---

## 6. AUTHENTICATION & SECURITY

### Implementation Status: COMPLETE

**Frontend Auth:**
- Single-user with username/password stored in env vars
- Password hashed with bcrypt
- JWT session tokens stored in HTTP-only cookies
- Middleware protects routes (except `/login`)
- Session expires after 7 days (configurable)

**Current Implementation:**
```
Frontend (.env.local):
- APP_USERNAME=admin
- APP_PASSWORD_HASH_B64=<base64 encoded bcrypt hash>
- SESSION_SECRET=<32+ char secret>
- SESSION_COOKIE_NAME=anki_session
- SESSION_MAX_AGE=604800
```

**Backend:**
- Currently NO authentication middleware
- All API endpoints are public (no session verification)
- CORS enabled for localhost and HTTPS origins
- Should add auth checking for sync endpoints

---

## 7. CONFIGURATION

### Frontend Configuration

**File:** `frontend/.env.local.example`
- App credentials (username, password hash)
- Session secrets
- Backend URL: `NEXT_PUBLIC_BACKEND_URL` (defaults to localhost:8787)

### Backend Configuration

**File:** `backend/wrangler.toml`
- D1 database binding
- Migrations directory
- Separate production database ID
- Compatibility date: 2025-01-01

**File:** `backend/.dev.vars` (local dev)
- OpenAI API key
- GitHub token (optional)
- OpenAI model selection

**File:** `backend/src/config/sources.ts`
- List of GitHub repos to sync from
- Currently only 1 source enabled (JavaScript Interview Questions)

---

## 8. DEPLOYMENT SETUP

### Frontend Deployment
**Target:** Cloudflare Pages

**Commands:**
```bash
cd frontend
pnpm pages:build      # Build for Cloudflare
wrangler pages deploy # Deploy
```

### Backend Deployment
**Target:** Cloudflare Workers

**Commands:**
```bash
cd backend
wrangler deploy       # Deploy workers
pnpm db:migrate:prod  # Run migrations on production DB
```

### Environment Variables (Production)
Set via Cloudflare dashboard or `wrangler secret put`:
```
APP_USERNAME
APP_PASSWORD_HASH_B64
SESSION_SECRET
OPENAI_API_KEY
GITHUB_TOKEN (optional)
OPENAI_MODEL (optional)
```

---

## 9. DIFFERENCES FROM SPEC

### Major Gaps

| Feature | Spec | Implementation | Status |
|---------|------|-----------------|--------|
| Settings Page | Detailed UI design | Not implemented | ❌ MISSING |
| Sync API Endpoint | `/api/sync` POST | Only CLI script | ❌ MISSING |
| Sync Status Endpoint | `/api/sync/status` GET | Not implemented | ❌ MISSING |
| Sync History Tracking | `sync_metadata` table | Not in schema | ❌ MISSING |
| Navigation Component | Global nav bar | Not implemented | ❌ MISSING |
| Dashboard | Stats + quick links | Just redirects | ⚠️ PARTIAL |
| Backend Auth Middleware | Session verification | Not implemented | ❌ MISSING |
| Real-time Sync Progress | Progress updates | Sync blocks until done | ⚠️ WORKAROUND |

### Minor Differences

1. **Sync Implementation**
   - Spec: Manual trigger from UI
   - Reality: CLI script only
   - Impact: Users must SSH into server to sync

2. **Architecture Decision**
   - Spec mentions cron jobs as future
   - Implementation: Only CLI runs locally
   - Could be: Set up Cloudflare Cron Triggers

3. **Database**
   - Spec includes optional sync_metadata table
   - Not created
   - Impact: Can't query sync history

---

## 10. WHAT'S FULLY WORKING

### ✓ Study Flow
- Fetch random unanswered questions
- Reveal answer on demand
- Record difficulty rating
- Next question loads automatically
- Keyboard shortcuts work

### ✓ Question Browsing
- List all questions
- Filter by difficulty
- Search by text
- Sort by recency/answer count
- Pagination
- View question details

### ✓ Question Sync (but CLI only)
- Fetch markdown from GitHub
- Parse with OpenAI API
- Handle duplicates (upsert)
- Batch insert for performance

### ✓ Authentication
- Single user login/logout
- Session management
- Protected routes
- Secure cookies

### ✓ Database
- D1 setup complete
- Migrations working
- Proper indexing
- Foreign key constraints

---

## 11. RECOMMENDATIONS FOR SPEC UPDATE

### Must-Have Features (for MVP)
1. Implement `/api/sync` endpoint to expose sync functionality
2. Create Settings page UI
3. Add basic sync status endpoint (last sync time, question count)

### Nice-to-Have (future)
1. Add sync_metadata table for history tracking
2. Implement global navigation
3. Add real-time sync progress (WebSocket or polling)
4. Setup Cloudflare Cron Triggers for automated sync

### Not Needed (spec can be removed)
- Scheduled/cron sync (can be manual for now)
- Complex sync history visualization

---

## 12. KEY FILES REFERENCE

### Frontend
```
frontend/
├── src/
│   ├── app/
│   │   ├── page.tsx                # Root (redirects to /study)
│   │   ├── login/page.tsx          # Login page ✓
│   │   ├── study/page.tsx          # Study page ✓
│   │   ├── questions/page.tsx      # Questions list ✓
│   │   ├── questions/[id]/page.tsx # Question details ✓
│   │   ├── api/login/route.ts      # Login API ✓
│   │   ├── api/logout/route.ts     # Logout API ✓
│   │   └── api/auth/session/route.ts # Session API ✓
│   └── lib/
│       ├── auth.ts                 # Credential verification
│       └── session.ts              # JWT session management
├── middleware.ts                   # Route protection
└── .env.local.example              # Config template
```

### Backend
```
backend/
├── src/
│   ├── index.ts                    # Main API routes ✓
│   ├── lib/
│   │   ├── db.ts                   # DB utilities
│   │   ├── github.ts               # GitHub fetcher
│   │   ├── openai-parser.ts        # Question parser
│   │   └── questions.ts            # Question upsert
│   └── config/
│       └── sources.ts              # Source configuration
├── scripts/
│   └── sync-github.ts              # Sync script (CLI only)
├── db/
│   ├── migrations/
│   │   └── 0001_initial_schema.sql # Schema ✓
│   ├── schema.sql                  # Schema reference
│   └── seed.sql                    # Sample data
└── wrangler.toml                   # Workers config
```

### Documentation
```
specs/
├── 01-database-setup.md            # Database spec ✓ (implemented)
├── 02-authentication.md            # Auth spec ✓ (implemented)
├── 03-github-sync.md               # Sync spec ~ (partial - CLI only)
├── 04-study-flow.md                # Study spec ✓ (implemented)
├── 05-questions-management.md      # Questions spec ✓ (implemented)
├── 06-settings-admin.md            # Settings spec ❌ (not implemented)
└── overview.md                     # Architecture overview
```

---

## Summary Table

| Area | Status | Notes |
|------|--------|-------|
| **Database** | ✓ Complete | D1 setup, schema, migrations working |
| **Authentication** | ✓ Complete | JWT + bcrypt, session management |
| **Study Flow** | ✓ Complete | Full implementation with keyboard shortcuts |
| **Question Management** | ✓ Complete | CRUD, search, filter, pagination |
| **GitHub Sync** | ⚠️ Partial | Script works, but not exposed as API |
| **Settings Page** | ❌ Missing | Spec exists, not implemented |
| **Sync Status/History** | ❌ Missing | No database tracking |
| **Deployment** | ✓ Ready | Cloudflare Pages + Workers configured |
| **Security** | ✓ Good | Single user, bcrypt, JWT, CORS |

