# Study Flow Implementation Spec

## Overview
Implement the core flashcard study experience: display random questions, reveal answers, collect difficulty ratings, and log results.

## Prerequisites
- Database setup completed
- Authentication implemented
- Questions synced to database

## User Flow

1. User navigates to `/study`
2. System shows a random question
3. User clicks "Show Answer"
4. System reveals the answer
5. User clicks difficulty: Easy, Medium, or Hard
6. System logs the response and updates aggregates
7. System loads next question
8. Repeat

## Implementation Tasks

### 1. API Endpoints

#### 1.1 Get next question endpoint
**Location:** `/src/app/api/study/next/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { getDB } from '@/lib/db';
import { Question } from '@/types/database';

export const runtime = 'edge';

export async function POST() {
  try {
    await requireSession();

    const db = getDB();

    // For v1: simple random selection
    // Future: weight by last_answered_at or difficulty
    const question = await db
      .prepare(
        `SELECT id, question_text, source
         FROM questions
         ORDER BY RANDOM()
         LIMIT 1`
      )
      .first<Pick<Question, 'id' | 'question_text' | 'source'>>();

    if (!question) {
      return NextResponse.json(
        { error: 'No questions available. Please sync questions first.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: question.id,
      question: question.question_text,
      source: question.source,
    });

  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    console.error('Get next question error:', error);
    return NextResponse.json(
      { error: 'Failed to get next question' },
      { status: 500 }
    );
  }
}
```

**Acceptance Criteria:**
- [ ] Returns random question
- [ ] Only returns question text (not answer)
- [ ] Requires authentication
- [ ] Handles empty database gracefully
- [ ] Returns question ID for subsequent answer submission

**Future enhancements:**
- [ ] Weight selection by last_answered_at (prioritize older questions)
- [ ] Weight by difficulty (prioritize harder questions)
- [ ] Exclude recently answered questions

#### 1.2 Submit answer endpoint
**Location:** `/src/app/api/study/[id]/answer/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { getDB } from '@/lib/db';
import { Difficulty } from '@/types/database';

export const runtime = 'edge';

interface AnswerRequest {
  difficulty: Difficulty;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireSession();

    const { id } = params;
    const body = await request.json() as AnswerRequest;
    const { difficulty } = body;

    // Validate difficulty
    if (!['easy', 'medium', 'hard'].includes(difficulty)) {
      return NextResponse.json(
        { error: 'Invalid difficulty value' },
        { status: 400 }
      );
    }

    const db = getDB();
    const now = new Date().toISOString();

    // Verify question exists
    const question = await db
      .prepare('SELECT id FROM questions WHERE id = ?')
      .bind(id)
      .first();

    if (!question) {
      return NextResponse.json(
        { error: 'Question not found' },
        { status: 404 }
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

    return NextResponse.json({
      success: true,
      message: 'Answer recorded',
    });

  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    console.error('Submit answer error:', error);
    return NextResponse.json(
      { error: 'Failed to submit answer' },
      { status: 500 }
    );
  }
}
```

**Acceptance Criteria:**
- [ ] Validates difficulty value
- [ ] Verifies question exists
- [ ] Inserts into answer_logs
- [ ] Updates question aggregates atomically
- [ ] Requires authentication
- [ ] Returns success response

#### 1.3 Get question with answer endpoint
**Location:** `/src/app/api/study/[id]/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { getDB } from '@/lib/db';
import { Question } from '@/types/database';

export const runtime = 'edge';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireSession();

    const { id } = params;
    const db = getDB();

    const question = await db
      .prepare(
        `SELECT id, question_text, answer_text, source
         FROM questions
         WHERE id = ?`
      )
      .bind(id)
      .first<Pick<Question, 'id' | 'question_text' | 'answer_text' | 'source'>>();

    if (!question) {
      return NextResponse.json(
        { error: 'Question not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: question.id,
      question: question.question_text,
      answer: question.answer_text,
      source: question.source,
    });

  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    console.error('Get question error:', error);
    return NextResponse.json(
      { error: 'Failed to get question' },
      { status: 500 }
    );
  }
}
```

**Acceptance Criteria:**
- [ ] Returns full question with answer
- [ ] Used for "Show Answer" functionality
- [ ] Requires authentication

### 2. Study Page UI

#### 2.1 Create study page
**Location:** `/src/app/study/page.tsx`

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
      const response = await fetch('/api/study/next', {
        method: 'POST',
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
      const response = await fetch(`/api/study/${question.id}`);

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
      const response = await fetch(`/api/study/${question.id}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

#### 2.2 Add keyboard shortcuts (enhancement)
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
**Location:** `/src/components/StudyStats.tsx`

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

### 4. Testing

#### 4.1 Manual testing checklist

**Happy path:**
- [ ] Navigate to /study
- [ ] Question loads automatically
- [ ] Only question text is visible
- [ ] Click "Show Answer" → answer appears
- [ ] Click "Easy" → next question loads
- [ ] Click "Medium" → next question loads
- [ ] Click "Hard" → next question loads
- [ ] Can complete multiple questions in sequence

**Edge cases:**
- [ ] No questions in database → shows helpful error
- [ ] Network error → shows error message
- [ ] Invalid question ID → handles gracefully
- [ ] Rapid clicking difficulty buttons → prevents double-submit

**Database verification:**
- [ ] Check answer_logs table has new entries
- [ ] Verify timestamps are correct
- [ ] Verify difficulty values recorded
- [ ] Check questions.last_answered_at updated
- [ ] Check questions.last_difficulty updated
- [ ] Check questions.answer_count incremented

#### 4.2 SQL verification queries

```sql
-- Check recent answer logs
SELECT
  al.id,
  q.question_text,
  al.difficulty,
  al.answered_at
FROM answer_logs al
JOIN questions q ON al.question_id = q.id
ORDER BY al.answered_at DESC
LIMIT 10;

-- Check question statistics
SELECT
  id,
  question_text,
  last_difficulty,
  last_answered_at,
  answer_count
FROM questions
WHERE answer_count > 0
ORDER BY last_answered_at DESC
LIMIT 10;

-- Difficulty distribution
SELECT
  difficulty,
  COUNT(*) as count
FROM answer_logs
GROUP BY difficulty;
```

### 5. Future Enhancements

#### 5.1 Weighted question selection

```typescript
// Instead of pure random, weight by:
// 1. Never answered questions (priority)
// 2. Least recently answered
// 3. Harder difficulty

export async function getNextWeightedQuestion(db: D1Database) {
  // Prioritize never-answered questions
  let question = await db.prepare(`
    SELECT id, question_text, source
    FROM questions
    WHERE last_answered_at IS NULL
    ORDER BY RANDOM()
    LIMIT 1
  `).first();

  if (question) return question;

  // Then oldest answered
  question = await db.prepare(`
    SELECT id, question_text, source
    FROM questions
    ORDER BY last_answered_at ASC
    LIMIT 1
  `).first();

  return question;
}
```

#### 5.2 Spaced repetition algorithm

Future consideration: Implement SM-2 or similar algorithm for optimal review timing.

## Success Criteria

- [x] API endpoint for next question works
- [x] API endpoint for submitting answer works
- [x] Study page UI functional
- [x] Question → Show Answer → Difficulty → Next Question flow works
- [x] Answer logs recorded in database
- [x] Question aggregates updated correctly
- [x] Error handling for empty database
- [x] Loading states prevent issues
- [x] Keyboard shortcuts work (if implemented)

## Next Steps

After study flow is complete:
1. Implement questions list and detail pages
2. Add filtering and sorting
3. Create settings page with sync button
4. Deploy and test end-to-end

## References

- [Next.js Client Components](https://nextjs.org/docs/app/building-your-application/rendering/client-components)
- [D1 Batch Operations](https://developers.cloudflare.com/d1/platform/client-api/#batch-statements)
- [Spaced Repetition Systems](https://en.wikipedia.org/wiki/Spaced_repetition)
