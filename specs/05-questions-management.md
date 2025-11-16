# Questions Management Implementation Spec

## Overview
Implement question browsing, filtering, sorting, and detail views to help users review their progress and explore all available questions.

## Prerequisites
- Database setup completed
- Authentication implemented
- Questions synced to database
- Study flow implemented

## Features

1. **Questions List Page** - Browse all questions with filters and sorting
2. **Question Detail Page** - View full question, answer, and answer history
3. **Search and Filter** - Find questions by keyword or difficulty
4. **Statistics** - View progress and answer distribution

## Implementation Tasks

### 1. Questions List API

#### 1.1 Create list endpoint with filters
**Location:** `/src/app/api/questions/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { getDB } from '@/lib/db';
import { Question } from '@/types/database';

export const runtime = 'edge';

interface QueryParams {
  difficulty?: 'easy' | 'medium' | 'hard';
  sort?: 'recent' | 'oldest' | 'most_answered' | 'least_answered';
  search?: string;
  limit?: number;
  offset?: number;
}

export async function GET(request: NextRequest) {
  try {
    await requireSession();

    const { searchParams } = request.nextUrl;

    // Parse query parameters
    const params: QueryParams = {
      difficulty: searchParams.get('difficulty') as any,
      sort: (searchParams.get('sort') as any) || 'recent',
      search: searchParams.get('search') || undefined,
      limit: parseInt(searchParams.get('limit') || '50', 10),
      offset: parseInt(searchParams.get('offset') || '0', 10),
    };

    const db = getDB();

    // Build query
    let query = 'SELECT * FROM questions WHERE 1=1';
    const bindings: any[] = [];

    // Filter by difficulty
    if (params.difficulty) {
      query += ' AND last_difficulty = ?';
      bindings.push(params.difficulty);
    }

    // Search in question text
    if (params.search) {
      query += ' AND question_text LIKE ?';
      bindings.push(`%${params.search}%`);
    }

    // Sort
    switch (params.sort) {
      case 'recent':
        query += ' ORDER BY last_answered_at DESC NULLS LAST';
        break;
      case 'oldest':
        query += ' ORDER BY last_answered_at ASC NULLS FIRST';
        break;
      case 'most_answered':
        query += ' ORDER BY answer_count DESC';
        break;
      case 'least_answered':
        query += ' ORDER BY answer_count ASC';
        break;
      default:
        query += ' ORDER BY created_at DESC';
    }

    // Pagination
    query += ' LIMIT ? OFFSET ?';
    bindings.push(params.limit, params.offset);

    // Execute query
    const result = await db.prepare(query).bind(...bindings).all<Question>();

    // Get total count for pagination
    let countQuery = 'SELECT COUNT(*) as count FROM questions WHERE 1=1';
    const countBindings: any[] = [];

    if (params.difficulty) {
      countQuery += ' AND last_difficulty = ?';
      countBindings.push(params.difficulty);
    }

    if (params.search) {
      countQuery += ' AND question_text LIKE ?';
      countBindings.push(`%${params.search}%`);
    }

    const countResult = await db
      .prepare(countQuery)
      .bind(...countBindings)
      .first<{ count: number }>();

    return NextResponse.json({
      questions: result.results || [],
      pagination: {
        total: countResult?.count || 0,
        limit: params.limit,
        offset: params.offset,
        hasMore: (params.offset + params.limit) < (countResult?.count || 0),
      },
    });

  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    console.error('Get questions error:', error);
    return NextResponse.json(
      { error: 'Failed to get questions' },
      { status: 500 }
    );
  }
}
```

**Acceptance Criteria:**
- [ ] Returns paginated question list
- [ ] Filters by difficulty
- [ ] Searches question text
- [ ] Sorts by multiple criteria
- [ ] Returns total count for pagination
- [ ] Requires authentication

#### 1.2 Create question detail endpoint
**Location:** `/src/app/api/questions/[id]/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { getDB } from '@/lib/db';
import { Question, AnswerLog } from '@/types/database';

export const runtime = 'edge';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireSession();

    const { id } = params;
    const db = getDB();

    // Get question
    const question = await db
      .prepare('SELECT * FROM questions WHERE id = ?')
      .bind(id)
      .first<Question>();

    if (!question) {
      return NextResponse.json(
        { error: 'Question not found' },
        { status: 404 }
      );
    }

    // Get recent answer logs
    const logs = await db
      .prepare(
        `SELECT * FROM answer_logs
         WHERE question_id = ?
         ORDER BY answered_at DESC
         LIMIT 20`
      )
      .bind(id)
      .all<AnswerLog>();

    return NextResponse.json({
      question,
      recentLogs: logs.results || [],
    });

  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    console.error('Get question detail error:', error);
    return NextResponse.json(
      { error: 'Failed to get question details' },
      { status: 500 }
    );
  }
}
```

**Acceptance Criteria:**
- [ ] Returns full question details
- [ ] Includes recent answer logs
- [ ] 404 for non-existent questions
- [ ] Requires authentication

#### 1.3 Create statistics endpoint
**Location:** `/src/app/api/questions/stats/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { getDB } from '@/lib/db';

export const runtime = 'edge';

export async function GET() {
  try {
    await requireSession();

    const db = getDB();

    // Total questions
    const totalResult = await db
      .prepare('SELECT COUNT(*) as count FROM questions')
      .first<{ count: number }>();

    // Answered questions
    const answeredResult = await db
      .prepare('SELECT COUNT(*) as count FROM questions WHERE answer_count > 0')
      .first<{ count: number }>();

    // Difficulty distribution
    const difficultyResult = await db
      .prepare(
        `SELECT last_difficulty, COUNT(*) as count
         FROM questions
         WHERE last_difficulty IS NOT NULL
         GROUP BY last_difficulty`
      )
      .all<{ last_difficulty: string; count: number }>();

    // Recent activity (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentActivityResult = await db
      .prepare(
        `SELECT COUNT(*) as count
         FROM answer_logs
         WHERE answered_at > ?`
      )
      .bind(sevenDaysAgo.toISOString())
      .first<{ count: number }>();

    // Build difficulty stats
    const difficultyStats = {
      easy: 0,
      medium: 0,
      hard: 0,
    };

    (difficultyResult.results || []).forEach(row => {
      if (row.last_difficulty === 'easy') difficultyStats.easy = row.count;
      if (row.last_difficulty === 'medium') difficultyStats.medium = row.count;
      if (row.last_difficulty === 'hard') difficultyStats.hard = row.count;
    });

    return NextResponse.json({
      totalQuestions: totalResult?.count || 0,
      answeredQuestions: answeredResult?.count || 0,
      unansweredQuestions: (totalResult?.count || 0) - (answeredResult?.count || 0),
      difficultyDistribution: difficultyStats,
      recentActivity: recentActivityResult?.count || 0,
    });

  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    console.error('Get stats error:', error);
    return NextResponse.json(
      { error: 'Failed to get statistics' },
      { status: 500 }
    );
  }
}
```

**Acceptance Criteria:**
- [ ] Returns total question count
- [ ] Returns answered/unanswered breakdown
- [ ] Returns difficulty distribution
- [ ] Returns recent activity count

### 2. Questions List Page UI

#### 2.1 Create questions list page
**Location:** `/src/app/questions/page.tsx`

```typescript
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Question {
  id: string;
  question_text: string;
  last_difficulty: 'easy' | 'medium' | 'hard' | null;
  last_answered_at: string | null;
  answer_count: number;
}

interface QuestionsResponse {
  questions: Question[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export default function QuestionsPage() {
  const [data, setData] = useState<QuestionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [difficulty, setDifficulty] = useState<string>('');
  const [sort, setSort] = useState<string>('recent');
  const [search, setSearch] = useState<string>('');
  const [searchInput, setSearchInput] = useState<string>('');

  useEffect(() => {
    loadQuestions();
  }, [difficulty, sort, search]);

  const loadQuestions = async () => {
    setLoading(true);

    const params = new URLSearchParams();
    if (difficulty) params.set('difficulty', difficulty);
    if (sort) params.set('sort', sort);
    if (search) params.set('search', search);

    try {
      const response = await fetch(`/api/questions?${params}`);
      const data = await response.json();
      setData(data);
    } catch (error) {
      console.error('Failed to load questions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
  };

  const getDifficultyColor = (difficulty: string | null) => {
    switch (difficulty) {
      case 'easy':
        return 'bg-green-100 text-green-800';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800';
      case 'hard':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8 flex justify-between items-center">
          <h1 className="text-2xl font-bold">All Questions</h1>
          <nav className="space-x-4">
            <Link href="/study" className="text-blue-600 hover:text-blue-800">
              Study
            </Link>
            <Link href="/settings" className="text-blue-600 hover:text-blue-800">
              Settings
            </Link>
          </nav>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Search */}
            <form onSubmit={handleSearch} className="flex gap-2">
              <input
                type="text"
                placeholder="Search questions..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Search
              </button>
            </form>

            {/* Difficulty filter */}
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Difficulties</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>

            {/* Sort */}
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="recent">Recently Answered</option>
              <option value="oldest">Oldest Answered</option>
              <option value="most_answered">Most Answered</option>
              <option value="least_answered">Least Answered</option>
            </select>
          </div>
        </div>

        {/* Results count */}
        {data && (
          <div className="mb-4 text-gray-600">
            Showing {data.questions.length} of {data.pagination.total} questions
          </div>
        )}

        {/* Questions list */}
        {loading ? (
          <div className="text-center py-12">
            <div className="text-gray-600">Loading questions...</div>
          </div>
        ) : data && data.questions.length > 0 ? (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Question
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Difficulty
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Last Answered
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Answer Count
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.questions.map((question) => (
                  <tr key={question.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <Link
                        href={`/questions/${question.id}`}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        <div className="max-w-2xl truncate">
                          {question.question_text}
                        </div>
                      </Link>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getDifficultyColor(
                          question.last_difficulty
                        )}`}
                      >
                        {question.last_difficulty || 'Not answered'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(question.last_answered_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {question.answer_count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12 bg-white rounded-lg shadow">
            <p className="text-gray-600">No questions found.</p>
            <Link
              href="/settings"
              className="mt-4 inline-block text-blue-600 hover:text-blue-800"
            >
              Sync questions from GitHub
            </Link>
          </div>
        )}

        {/* Pagination (future enhancement) */}
        {data && data.pagination.hasMore && (
          <div className="mt-6 text-center">
            <button className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
              Load More
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

**Acceptance Criteria:**
- [ ] Displays questions in table format
- [ ] Search by question text
- [ ] Filter by difficulty
- [ ] Sort by multiple criteria
- [ ] Click question to view details
- [ ] Shows answer count and last answered date
- [ ] Loading states
- [ ] Empty state with link to sync

### 3. Question Detail Page UI

#### 3.1 Create question detail page
**Location:** `/src/app/questions/[id]/page.tsx`

```typescript
'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface Question {
  id: string;
  question_text: string;
  answer_text: string;
  source: string;
  created_at: string;
  updated_at: string;
  last_answered_at: string | null;
  last_difficulty: 'easy' | 'medium' | 'hard' | null;
  answer_count: number;
}

interface AnswerLog {
  id: number;
  difficulty: 'easy' | 'medium' | 'hard';
  answered_at: string;
}

interface QuestionDetail {
  question: Question;
  recentLogs: AnswerLog[];
}

export default function QuestionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [data, setData] = useState<QuestionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadQuestion();
  }, [params.id]);

  const loadQuestion = async () => {
    try {
      const response = await fetch(`/api/questions/${params.id}`);

      if (!response.ok) {
        if (response.status === 404) {
          setError('Question not found');
        } else {
          setError('Failed to load question');
        }
        return;
      }

      const data = await response.json();
      setData(data);

    } catch (err) {
      setError('Failed to load question');
      console.error('Load question error:', err);
    } finally {
      setLoading(false);
    }
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy':
        return 'bg-green-100 text-green-800';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800';
      case 'hard':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-600">Loading question...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error || 'Question not found'}</p>
          <Link href="/questions" className="text-blue-600 hover:text-blue-800">
            Back to Questions
          </Link>
        </div>
      </div>
    );
  }

  const { question, recentLogs } = data;

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8 flex justify-between items-center">
          <Link href="/questions" className="text-blue-600 hover:text-blue-800">
            ← Back to Questions
          </Link>
          <nav className="space-x-4">
            <Link href="/study" className="text-blue-600 hover:text-blue-800">
              Study
            </Link>
            <Link href="/settings" className="text-blue-600 hover:text-blue-800">
              Settings
            </Link>
          </nav>
        </div>

        {/* Question card */}
        <div className="bg-white rounded-lg shadow-lg p-8 mb-6">
          {/* Metadata */}
          <div className="flex justify-between items-start mb-6 pb-4 border-b">
            <div>
              <div className="text-sm text-gray-500 mb-2">
                Source: {question.source.split('/').pop()}
              </div>
              <div className="text-sm text-gray-500">
                Answer count: {question.answer_count}
              </div>
            </div>
            {question.last_difficulty && (
              <span
                className={`px-3 py-1 inline-flex text-sm font-semibold rounded-full ${getDifficultyColor(
                  question.last_difficulty
                )}`}
              >
                Last: {question.last_difficulty}
              </span>
            )}
          </div>

          {/* Question */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4 text-gray-800">
              Question:
            </h2>
            <p className="text-lg leading-relaxed whitespace-pre-wrap">
              {question.question_text}
            </p>
          </div>

          {/* Answer */}
          <div className="pt-8 border-t border-gray-200">
            <h2 className="text-xl font-semibold mb-4 text-gray-800">
              Answer:
            </h2>
            <div className="text-lg leading-relaxed whitespace-pre-wrap prose max-w-none">
              {question.answer_text}
            </div>
          </div>
        </div>

        {/* Answer history */}
        {recentLogs.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">Answer History</h3>
            <div className="space-y-2">
              {recentLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex justify-between items-center py-2 border-b last:border-b-0"
                >
                  <span
                    className={`px-2 py-1 inline-flex text-xs font-semibold rounded-full ${getDifficultyColor(
                      log.difficulty
                    )}`}
                  >
                    {log.difficulty}
                  </span>
                  <span className="text-sm text-gray-500">
                    {formatDateTime(log.answered_at)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

**Acceptance Criteria:**
- [ ] Shows full question and answer
- [ ] Displays metadata (source, answer count, last difficulty)
- [ ] Shows answer history with timestamps
- [ ] Back button to questions list
- [ ] Error handling for 404
- [ ] Loading state

### 4. Statistics Dashboard (Optional)

#### 4.1 Create stats component
**Location:** `/src/components/QuestionStats.tsx`

```typescript
'use client';

import { useState, useEffect } from 'react';

interface Stats {
  totalQuestions: number;
  answeredQuestions: number;
  unansweredQuestions: number;
  difficultyDistribution: {
    easy: number;
    medium: number;
    hard: number;
  };
  recentActivity: number;
}

export default function QuestionStats() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const response = await fetch('/api/questions/stats');
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !stats) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
      <div className="bg-white rounded-lg shadow p-4">
        <div className="text-2xl font-bold text-blue-600">
          {stats.totalQuestions}
        </div>
        <div className="text-sm text-gray-600">Total Questions</div>
      </div>

      <div className="bg-white rounded-lg shadow p-4">
        <div className="text-2xl font-bold text-green-600">
          {stats.answeredQuestions}
        </div>
        <div className="text-sm text-gray-600">Answered</div>
      </div>

      <div className="bg-white rounded-lg shadow p-4">
        <div className="text-2xl font-bold text-gray-600">
          {stats.unansweredQuestions}
        </div>
        <div className="text-sm text-gray-600">Unanswered</div>
      </div>

      <div className="bg-white rounded-lg shadow p-4">
        <div className="text-2xl font-bold text-purple-600">
          {stats.recentActivity}
        </div>
        <div className="text-sm text-gray-600">Last 7 Days</div>
      </div>
    </div>
  );
}
```

**Usage:**
Add to questions list page above the filters.

### 5. Testing

#### 5.1 Manual testing checklist

**Questions list:**
- [ ] Navigate to /questions
- [ ] See list of all questions
- [ ] Search for keyword → filters results
- [ ] Select difficulty filter → shows only that difficulty
- [ ] Change sort order → reorders list
- [ ] Click question → goes to detail page

**Question detail:**
- [ ] Shows full question and answer
- [ ] Shows metadata correctly
- [ ] Shows answer history if exists
- [ ] Back button works

**Statistics:**
- [ ] Stats display correctly
- [ ] Counts are accurate
- [ ] Recent activity calculates correctly

#### 5.2 Data verification

```sql
-- Verify question counts match UI
SELECT
  COUNT(*) as total,
  SUM(CASE WHEN answer_count > 0 THEN 1 ELSE 0 END) as answered,
  SUM(CASE WHEN answer_count = 0 THEN 1 ELSE 0 END) as unanswered
FROM questions;

-- Verify difficulty distribution
SELECT
  last_difficulty,
  COUNT(*) as count
FROM questions
WHERE last_difficulty IS NOT NULL
GROUP BY last_difficulty;
```

## Success Criteria

- [x] Questions list API with filters and sorting
- [x] Question detail API with history
- [x] Statistics API
- [x] Questions list page functional
- [x] Search and filters work
- [x] Sorting works
- [x] Question detail page shows full info
- [x] Answer history displayed
- [x] Statistics dashboard (if implemented)
- [x] Pagination support (basic)

## Next Steps

After questions management is complete:
1. Implement settings page
2. Add sync UI
3. Test entire flow end-to-end
4. Deploy to Cloudflare Pages

## References

- [Next.js Dynamic Routes](https://nextjs.org/docs/app/building-your-application/routing/dynamic-routes)
- [D1 Querying](https://developers.cloudflare.com/d1/platform/client-api/)
- [Tailwind CSS Tables](https://tailwindcss.com/docs/table-layout)
