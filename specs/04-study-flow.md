# Study Flow Implementation Spec

## Overview
Implement the core flashcard study experience: display random questions, reveal answers, collect difficulty ratings, and log results.

## Architecture
This is a monorepo with separate frontend and backend:
- **Frontend**: Next.js 15 (App Router) on Cloudflare Pages - UI and authentication
- **Backend**: Cloudflare Workers with Hono framework - API endpoints and D1 database access
- **Database**: D1 (SQLite) bound to backend Workers

## Prerequisites
- Database setup completed (D1 bound to backend)
- Authentication implemented (frontend)
- Questions synced to database (backend GitHub sync)

## User Flow

1. User navigates to `/study` (frontend)
2. Frontend calls backend API to get random question
3. System shows the question
4. User clicks "Show Answer"
5. Frontend calls backend API to get full question with answer
6. System reveals the answer
7. User clicks difficulty: Easy, Medium, or Hard
8. Frontend submits difficulty to backend API
9. Backend logs the response and updates aggregates
10. System loads next question
11. Repeat

## Implementation Tasks

### 1. Backend API Endpoints (Hono)

All API endpoints are implemented in the backend using Hono framework.

**Backend Location:** `/backend/src/index.ts`

#### 1.1 Get next question endpoint
**Route:** `POST /api/study/next`

```typescript
import { Hono } from 'hono';
import { cors } from 'hono/cors';

type Bindings = {
  DB: D1Database;
};

const app = new Hono<{ Bindings: Bindings }>();

// Enable CORS for frontend
app.use('/*', cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));

// Study endpoints
app.post('/api/study/next', async (c) => {
  try {
    const db = c.env.DB;

    // For v1: simple random selection
    // Future: weight by last_answered_at or difficulty
    const question = await db
      .prepare(
        `SELECT id, question_text, source
         FROM questions
         ORDER BY RANDOM()
         LIMIT 1`
      )
      .first<{ id: string; question_text: string; source: string }>();

    if (!question) {
      return c.json(
        { error: 'No questions available. Please sync questions first.' },
        404
      );
    }

    return c.json({
      id: question.id,
      question: question.question_text,
      source: question.source,
    });
  } catch (error) {
    console.error('Get next question error:', error);
    return c.json(
      { error: 'Failed to get next question' },
      500
    );
  }
});

export default app;
```

**Acceptance Criteria:**
- [ ] Returns random question
- [ ] Only returns question text (not answer)
- [ ] Handles empty database gracefully
- [ ] Returns question ID for subsequent answer submission
- [ ] CORS configured for frontend access

**Future enhancements:**
- [ ] Add authentication middleware (verify JWT from frontend)
- [ ] Weight selection by last_answered_at (prioritize older questions)
- [ ] Weight by difficulty (prioritize harder questions)
- [ ] Exclude recently answered questions

#### 1.2 Submit answer endpoint
**Route:** `POST /api/study/:id/answer`

```typescript
app.post('/api/study/:id/answer', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json<{ difficulty: string }>();
    const { difficulty } = body;

    // Validate difficulty
    if (!['easy', 'medium', 'hard'].includes(difficulty)) {
      return c.json(
        { error: 'Invalid difficulty value' },
        400
      );
    }

    const db = c.env.DB;
    const now = new Date().toISOString();

    // Verify question exists
    const question = await db
      .prepare('SELECT id FROM questions WHERE id = ?')
      .bind(id)
      .first();

    if (!question) {
      return c.json(
        { error: 'Question not found' },
        404
      );
    }

    // Use D1 batch for atomic transaction
    await db.batch([
      // Insert into answer_logs
      db.prepare(
        `INSERT INTO answer_logs (question_id, difficulty, answered_at)
         VALUES (?, ?, ?)`
      ).bind(id, difficulty, now),

      // Update question aggregates
      db.prepare(
        `UPDATE questions
         SET last_answered_at = ?,
             last_difficulty = ?,
             answer_count = answer_count + 1
         WHERE id = ?`
      ).bind(now, difficulty, id),
    ]);

    return c.json({
      success: true,
      message: 'Answer recorded',
    });
  } catch (error) {
    console.error('Submit answer error:', error);
    return c.json(
      { error: 'Failed to submit answer' },
      500
    );
  }
});
```

**Acceptance Criteria:**
- [ ] Validates difficulty value
- [ ] Verifies question exists
- [ ] Inserts into answer_logs
- [ ] Updates question aggregates atomically (D1 batch)
- [ ] Returns success response

**Future enhancements:**
- [ ] Add authentication middleware

#### 1.3 Get question with answer endpoint
**Route:** `GET /api/study/:id`

```typescript
app.get('/api/study/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const db = c.env.DB;

    const question = await db
      .prepare(
        `SELECT id, question_text, answer_text, source
         FROM questions
         WHERE id = ?`
      )
      .bind(id)
      .first<{
        id: string;
        question_text: string;
        answer_text: string;
        source: string;
      }>();

    if (!question) {
      return c.json(
        { error: 'Question not found' },
        404
      );
    }

    return c.json({
      id: question.id,
      question: question.question_text,
      answer: question.answer_text,
      source: question.source,
    });
  } catch (error) {
    console.error('Get question error:', error);
    return c.json(
      { error: 'Failed to get question' },
      500
    );
  }
});
```

**Acceptance Criteria:**
- [ ] Returns full question with answer
- [ ] Used for "Show Answer" functionality

**Future enhancements:**
- [ ] Add authentication middleware

### 2. Frontend Study Page UI

#### 2.1 Create study page
**Location:** `/frontend/src/app/study/page.tsx`

**Note:** Update API calls to point to backend Worker URL (configured via environment variable)

```typescript
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface QuestionData {
  id: string;
  question: string;
  answer?: string;
  source: string;
}

type Difficulty = 'easy' | 'medium' | 'hard';

export default function StudyPage() {
  const router = useRouter();
  const [question, setQuestion] = useState<QuestionData | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load first question on mount
  useEffect(() => {
    loadNextQuestion();
  }, []);

  const loadNextQuestion = async () => {
    setLoading(true);
    setError(null);
    setShowAnswer(false);

    try {
      // Call backend API (configure BACKEND_URL in .env)
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8787';
      const response = await fetch(`${backendUrl}/api/study/next`, {
        method: 'POST',
        credentials: 'include', // Send cookies for auth
      });

      if (!response.ok) {
        if (response.status === 404) {
          setError('No questions available. Please sync questions first.');
          return;
        }
        throw new Error('Failed to load question');
      }

      const data = await response.json();
      setQuestion(data);

    } catch (err) {
      setError('Failed to load question. Please try again.');
      console.error('Load question error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleShowAnswer = async () => {
    if (!question) return;

    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8787';
      const response = await fetch(`${backendUrl}/api/study/${question.id}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to load answer');
      }

      const data = await response.json();
      setQuestion(data);
      setShowAnswer(true);

    } catch (err) {
      setError('Failed to load answer. Please try again.');
      console.error('Load answer error:', err);
    }
  };

  const handleDifficulty = async (difficulty: Difficulty) => {
    if (!question) return;

    setLoading(true);

    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8787';
      const response = await fetch(`${backendUrl}/api/study/${question.id}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ difficulty }),
      });

      if (!response.ok) {
        throw new Error('Failed to submit answer');
      }

      // Load next question
      await loadNextQuestion();

    } catch (err) {
      setError('Failed to submit answer. Please try again.');
      console.error('Submit answer error:', err);
      setLoading(false);
    }
  };

  if (error && !question) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-2xl w-full mx-auto p-6">
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
          <button
            onClick={() => router.push('/settings')}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Go to Settings
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-3xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8 flex justify-between items-center">
          <h1 className="text-2xl font-bold">Study Session</h1>
          <nav className="space-x-4">
            <a href="/questions" className="text-blue-600 hover:text-blue-800">
              All Questions
            </a>
            <a href="/settings" className="text-blue-600 hover:text-blue-800">
              Settings
            </a>
          </nav>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        {/* Question card */}
        {loading && !question ? (
          <div className="text-center py-12">
            <div className="text-gray-600">Loading question...</div>
          </div>
        ) : question ? (
          <div className="bg-white rounded-lg shadow-lg p-8">
            {/* Source */}
            <div className="text-sm text-gray-500 mb-4">
              Source: {question.source.split('/').pop()}
            </div>

            {/* Question */}
            <div className="mb-8">
              <h2 className="text-xl font-semibold mb-4 text-gray-800">
                Question:
              </h2>
              <p className="text-lg leading-relaxed whitespace-pre-wrap">
                {question.question}
              </p>
            </div>

            {/* Show Answer Button */}
            {!showAnswer ? (
              <div className="flex justify-center">
                <button
                  onClick={handleShowAnswer}
                  className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 text-lg font-medium"
                >
                  Show Answer
                </button>
              </div>
            ) : (
              <>
                {/* Answer */}
                <div className="mb-8 pt-8 border-t border-gray-200">
                  <h2 className="text-xl font-semibold mb-4 text-gray-800">
                    Answer:
                  </h2>
                  <div className="text-lg leading-relaxed whitespace-pre-wrap prose max-w-none">
                    {question.answer}
                  </div>
                </div>

                {/* Difficulty Buttons */}
                <div className="pt-6 border-t border-gray-200">
                  <p className="text-center text-gray-600 mb-4">
                    How difficult was this question?
                  </p>
                  <div className="flex gap-4 justify-center">
                    <button
                      onClick={() => handleDifficulty('easy')}
                      disabled={loading}
                      className="px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                    >
                      Easy
                    </button>
                    <button
                      onClick={() => handleDifficulty('medium')}
                      disabled={loading}
                      className="px-6 py-3 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                    >
                      Medium
                    </button>
                    <button
                      onClick={() => handleDifficulty('hard')}
                      disabled={loading}
                      className="px-6 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                    >
                      Hard
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
```

**Acceptance Criteria:**
- [ ] Shows random question on load
- [ ] "Show Answer" button reveals answer
- [ ] Three difficulty buttons (Easy, Medium, Hard)
- [ ] Clicking difficulty loads next question
- [ ] Loading states during API calls
- [ ] Error handling with user feedback
- [ ] Disabled state prevents double-submission
- [ ] Navigation to other pages

#### 2.2 Environment Configuration
**Location:** `/frontend/.env.local`

```bash
# Backend API URL
NEXT_PUBLIC_BACKEND_URL=http://localhost:8787  # Development
# NEXT_PUBLIC_BACKEND_URL=https://your-worker.workers.dev  # Production
```

#### 2.3 Add keyboard shortcuts (enhancement)
**Location:** Add to study page

```typescript
// Inside StudyPage component
useEffect(() => {
  const handleKeyPress = (e: KeyboardEvent) => {
    if (loading) return;

    // Space or Enter to show answer
    if (!showAnswer && (e.key === ' ' || e.key === 'Enter')) {
      e.preventDefault();
      handleShowAnswer();
    }

    // Number keys for difficulty
    if (showAnswer) {
      if (e.key === '1') handleDifficulty('easy');
      if (e.key === '2') handleDifficulty('medium');
      if (e.key === '3') handleDifficulty('hard');
    }
  };

  window.addEventListener('keydown', handleKeyPress);
  return () => window.removeEventListener('keydown', handleKeyPress);
}, [showAnswer, loading, question]);
```

**Acceptance Criteria:**
- [ ] Space/Enter shows answer
- [ ] 1/2/3 keys select difficulty
- [ ] Keyboard shortcuts only when not loading

### 3. Study Statistics Component (Optional)

#### 3.1 Create session stats
**Location:** `/frontend/src/components/StudyStats.tsx`

```typescript
'use client';

import { useState, useEffect } from 'react';

interface StudyStats {
  total: number;
  easy: number;
  medium: number;
  hard: number;
}

export default function StudyStats() {
  const [stats, setStats] = useState<StudyStats>({
    total: 0,
    easy: 0,
    medium: 0,
    hard: 0,
  });

  // Track stats in session storage
  useEffect(() => {
    const saved = sessionStorage.getItem('study_stats');
    if (saved) {
      setStats(JSON.parse(saved));
    }
  }, []);

  const recordAnswer = (difficulty: 'easy' | 'medium' | 'hard') => {
    setStats(prev => {
      const updated = {
        ...prev,
        total: prev.total + 1,
        [difficulty]: prev[difficulty] + 1,
      };
      sessionStorage.setItem('study_stats', JSON.stringify(updated));
      return updated;
    });
  };

  const resetStats = () => {
    const reset = { total: 0, easy: 0, medium: 0, hard: 0 };
    setStats(reset);
    sessionStorage.setItem('study_stats', JSON.stringify(reset));
  };

  return (
    <div className="bg-white rounded-lg shadow p-4 mb-4">
      <div className="flex justify-between items-center mb-2">
        <h3 className="font-semibold">Session Progress</h3>
        <button
          onClick={resetStats}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Reset
        </button>
      </div>
      <div className="grid grid-cols-4 gap-4 text-center">
        <div>
          <div className="text-2xl font-bold">{stats.total}</div>
          <div className="text-xs text-gray-500">Total</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-green-600">{stats.easy}</div>
          <div className="text-xs text-gray-500">Easy</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-yellow-600">{stats.medium}</div>
          <div className="text-xs text-gray-500">Medium</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-red-600">{stats.hard}</div>
          <div className="text-xs text-gray-500">Hard</div>
        </div>
      </div>
    </div>
  );
}
```

**Usage:**
```typescript
// Import and use in study page
import StudyStats from '@/components/StudyStats';
```

### 4. Deployment Configuration

#### 4.1 Backend Wrangler Configuration
**Location:** `/backend/wrangler.toml`

Ensure D1 binding is configured:
```toml
[[d1_databases]]
binding = "DB"
database_name = "anki-interview-db"
database_id = "your-database-id"

[env.production.d1_databases]
binding = "DB"
database_name = "anki-interview-db-prod"
database_id = "your-prod-database-id"
```

#### 4.2 Frontend Environment Variables
**Location:** `/frontend/.env.production`

```bash
NEXT_PUBLIC_BACKEND_URL=https://your-worker.workers.dev
```

### 5. Testing

#### 5.1 Local Development

1. Start backend:
   ```bash
   cd backend
   pnpm dev  # Runs on http://localhost:8787
   ```

2. Start frontend:
   ```bash
   cd frontend
   pnpm dev  # Runs on http://localhost:3000
   ```

3. Ensure questions are synced:
   ```bash
   cd backend
   pnpm sync
   ```

#### 5.2 Manual testing checklist

**Happy path:**
- [ ] Backend and frontend both running
- [ ] Navigate to /study on frontend
- [ ] Question loads automatically from backend
- [ ] Only question text is visible
- [ ] Click "Show Answer" → answer appears
- [ ] Click "Easy" → next question loads
- [ ] Click "Medium" → next question loads
- [ ] Click "Hard" → next question loads
- [ ] Can complete multiple questions in sequence

**Edge cases:**
- [ ] Backend not running → shows connection error
- [ ] No questions in database → shows helpful error
- [ ] Network error → shows error message
- [ ] Invalid question ID → handles gracefully
- [ ] Rapid clicking difficulty buttons → prevents double-submit
- [ ] CORS errors → verify CORS configuration in backend

**Database verification:**
- [ ] Use Wrangler to query D1:
  ```bash
  cd backend
  wrangler d1 execute anki-interview-db --local --command "SELECT * FROM answer_logs ORDER BY answered_at DESC LIMIT 5"
  ```
- [ ] Check answer_logs table has new entries
- [ ] Verify timestamps are correct
- [ ] Verify difficulty values recorded
- [ ] Check questions.last_answered_at updated
- [ ] Check questions.last_difficulty updated
- [ ] Check questions.answer_count incremented

#### 5.3 SQL verification queries

Run these via Wrangler CLI:

```bash
# Check recent answer logs
wrangler d1 execute anki-interview-db --local --command \
  "SELECT al.id, q.question_text, al.difficulty, al.answered_at
   FROM answer_logs al
   JOIN questions q ON al.question_id = q.id
   ORDER BY al.answered_at DESC
   LIMIT 10"

# Check question statistics
wrangler d1 execute anki-interview-db --local --command \
  "SELECT id, question_text, last_difficulty, last_answered_at, answer_count
   FROM questions
   WHERE answer_count > 0
   ORDER BY last_answered_at DESC
   LIMIT 10"

# Difficulty distribution
wrangler d1 execute anki-interview-db --local --command \
  "SELECT difficulty, COUNT(*) as count
   FROM answer_logs
   GROUP BY difficulty"
```

### 6. Future Enhancements

#### 6.1 Authentication for Backend API

Currently, authentication is handled in the frontend via JWT cookies. Future enhancement should add:

1. **Auth middleware in Hono:**
   ```typescript
   import { verify } from 'hono/jwt';

   const authMiddleware = async (c, next) => {
     const token = getCookie(c, 'anki_session');
     if (!token) {
       return c.json({ error: 'Unauthorized' }, 401);
     }

     try {
       const payload = await verify(token, c.env.SESSION_SECRET);
       c.set('user', payload);
       await next();
     } catch {
       return c.json({ error: 'Invalid token' }, 401);
     }
   };

   // Apply to study routes
   app.use('/api/study/*', authMiddleware);
   ```

2. **Share session secret between frontend and backend** via environment variables

#### 6.2 Weighted question selection

```typescript
// In backend: Instead of pure random, weight by:
// 1. Never answered questions (priority)
// 2. Least recently answered
// 3. Harder difficulty

app.post('/api/study/next', async (c) => {
  const db = c.env.DB;

  // Prioritize never-answered questions
  let question = await db.prepare(`
    SELECT id, question_text, source
    FROM questions
    WHERE last_answered_at IS NULL
    ORDER BY RANDOM()
    LIMIT 1
  `).first();

  if (question) return c.json(transformQuestion(question));

  // Then oldest answered
  question = await db.prepare(`
    SELECT id, question_text, source
    FROM questions
    ORDER BY last_answered_at ASC
    LIMIT 1
  `).first();

  return c.json(transformQuestion(question));
});
```

#### 6.3 Spaced repetition algorithm

Future consideration: Implement SM-2 or similar algorithm for optimal review timing.

## Success Criteria

- [ ] Backend API endpoint for next question works (`POST /api/study/next`)
- [ ] Backend API endpoint for getting answer works (`GET /api/study/:id`)
- [ ] Backend API endpoint for submitting answer works (`POST /api/study/:id/answer`)
- [ ] Frontend study page UI functional
- [ ] Frontend correctly calls backend API endpoints
- [ ] CORS configured properly between frontend and backend
- [ ] Question → Show Answer → Difficulty → Next Question flow works end-to-end
- [ ] Answer logs recorded in D1 database
- [ ] Question aggregates updated correctly
- [ ] Error handling for empty database
- [ ] Error handling for backend connection issues
- [ ] Loading states prevent issues
- [ ] Keyboard shortcuts work (if implemented)
- [ ] Local development workflow documented (backend + frontend)

## Next Steps

After study flow is complete:
1. Implement questions list and detail pages (frontend + backend API)
2. Add filtering and sorting endpoints
3. Create settings page with sync button (trigger backend GitHub sync)
4. Deploy backend Worker and frontend Pages
5. Configure production D1 database
6. Test end-to-end in production

## Deployment

### Backend Deployment
```bash
cd backend
wrangler deploy
```

### Frontend Deployment
```bash
cd frontend
pnpm build
# Deploy to Cloudflare Pages via dashboard or CLI
```

### Environment Setup
1. Create production D1 database: `wrangler d1 create anki-interview-db-prod`
2. Run migrations: `wrangler d1 migrations apply anki-interview-db-prod`
3. Set frontend env var: `NEXT_PUBLIC_BACKEND_URL=https://your-worker.workers.dev`
4. Configure CORS in backend to allow production frontend origin

## References

- [Hono Framework](https://hono.dev/)
- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
- [Cloudflare D1](https://developers.cloudflare.com/d1/)
- [D1 Batch Operations](https://developers.cloudflare.com/d1/platform/client-api/#batch-statements)
- [Next.js on Cloudflare Pages](https://developers.cloudflare.com/pages/framework-guides/nextjs/)
- [Spaced Repetition Systems](https://en.wikipedia.org/wiki/Spaced_repetition)
