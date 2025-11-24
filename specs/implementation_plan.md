# Anki Interview App – Implementation Plan

## 1. Project Setup

1. Create Next.js app (App Router).
   - `npx create-next-app anki-interview`
2. Add TypeScript (if not already).
3. Prepare for Cloudflare:
   - Add `@cloudflare/next-on-pages` or latest recommended adapter.
   - Add `wrangler.toml` for D1 + Pages.

---

## 2. Database (Cloudflare D1)

1. Define schema file (e.g. `schema.sql`):
   - `questions` table.
   - `answer_logs` table.
2. Configure D1 in `wrangler.toml`.
3. Run migration:
   - `wrangler d1 migrations apply`.

---

## 3. Env and Auth

1. Define env vars:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (for client-side)
   - `SESSION_SECRET`
   - `GITHUB_SOURCE_URL` (or hardcode for now).
2. Implement Google OAuth authentication:
   - Set up Google OAuth flow
   - Create user accounts on first login
   - Sign a JWT-like token with a secret (e.g. `SESSION_SECRET`).
   - Store in HTTP-only cookie.
3. Add `middleware.ts`:
   - Protect all routes except `/login` and OAuth callback.
   - If no valid session cookie → redirect to `/login`.

---

## 4. API Routes

Create route handlers under `app/api`.

### 4.1 Authentication

- `GET /api/auth/callback/google`
  - Handle Google OAuth callback
  - Exchange code for tokens
  - Create or update user account
  - Set session cookie
  - Redirect to app
- `POST /api/logout`
  - Clear cookie.

### 4.2 Sync

- `POST /api/sync`
  - Fetch markdown from GitHub.
  - Parse to Q/A pairs using OpenAI API
  - Upsert into `questions` table.
  - Return summary `{ total, inserted, updated }`.

### 4.3 Questions

- `GET /api/questions`
  - Accept `difficulty`, `sort`, `limit`, `offset`.
  - Return list of questions for table view.
- `GET /api/questions/[id]`
  - Return full Q/A and last few logs.

### 4.4 Study

- `POST /api/study/next`
  - Select a random question:
    - For v1: `ORDER BY RANDOM() LIMIT 1`.
  - Return question (id + question_text).
- `POST /api/study/[id]/answer`
  - Body: `{ difficulty }`.
  - Insert into `answer_logs`.
  - Update `questions.last_answered_at`, `last_difficulty`, `answer_count`.

---

## 5. Pages / UI

### 5.1 `/login`

- Google OAuth sign-in button.
- Redirects to Google OAuth consent screen.
- On success: redirect to `/study`.

### 5.2 `/study`

- On mount:
  - Call `POST /api/study/next`.
- Show:
  - Question text.
  - Button “Show answer”.
- After “Show answer”:
  - Reveal answer.
  - Show three buttons: Easy / Medium / Hard.
- On difficulty click:
  - Call `POST /api/study/[id]/answer`.
  - Then fetch next question.

### 5.3 `/questions`

- Table view:
  - Use `GET /api/questions`.
- Filter dropdown for difficulty.
- Click row → go to `/questions/[id]`.

### 5.4 `/questions/[id]`

- Fetch question detail.
- Show:
  - full question,
  - full answer,
  - small history (last N logs).

### 5.5 `/settings`

- “Sync from GitHub” button.
  - Calls `POST /api/sync`.
- Show:
  - last sync time,
  - total questions.

---

## 6. Minimal Styling

- Use default Next.js + simple CSS / Tailwind.
- Focus on:
  - readable font sizes,
  - single-column layout,
  - clear buttons.

---

## 7. Testing Checklist

- Can log in / log out.
- Sync runs and inserts questions.
- Study flow:
  - question → show answer → difficulty → next question.
- Logs and aggregates update in DB.
- Question list shows:
  - last difficulty,
  - last answered at,
  - answer count.
- All routes redirect to `/login` when not authenticated.
