# GitHub Sync Implementation Spec

## Overview
Implement functionality to fetch interview questions from GitHub repositories, parse them using OpenAI API, and store them in the database.

## Prerequisites
- Database setup completed
- Authentication implemented
- OpenAI API access configured

## Source Repository

**Example:** [Back-End-Developer-Interview-Questions](https://github.com/arialdomartini/Back-End-Developer-Interview-Questions)

## Implementation Tasks

### 1. Configuration

#### 1.1 Define GitHub source configuration
**Location:** `/src/config/sources.ts`

```typescript
export interface QuestionSource {
  id: string;
  name: string;
  url: string;
  filePattern?: RegExp;
}

export const QUESTION_SOURCES: QuestionSource[] = [
  {
    id: 'backend-interview',
    name: 'Back-End Developer Interview Questions',
    url: 'https://raw.githubusercontent.com/arialdomartini/Back-End-Developer-Interview-Questions/master/README.md',
  },
  // Add more sources as needed
];

export function getSourceById(id: string): QuestionSource | undefined {
  return QUESTION_SOURCES.find(source => source.id === id);
}

export function getAllSources(): QuestionSource[] {
  return QUESTION_SOURCES;
}
```

**Acceptance Criteria:**
- [ ] Source configuration file created
- [ ] At least one source configured
- [ ] Helper functions to access sources
- [ ] Extensible for multiple sources

#### 1.2 Add environment variables
**Location:** `.env.local`

```env
# OpenAI Configuration
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini

# GitHub Configuration (optional)
GITHUB_TOKEN=ghp_... # Optional, for private repos or higher rate limits
```

**Tasks:**
- [ ] Add OpenAI API key to environment
- [ ] Configure OpenAI model to use
- [ ] Optionally add GitHub token
- [ ] Set in Cloudflare for production: `npx wrangler secret put OPENAI_API_KEY`

### 2. Markdown Fetching

#### 2.1 Create GitHub fetcher utility
**Location:** `/src/lib/github.ts`

```typescript
export interface FetchResult {
  content: string;
  source: string;
  fetchedAt: Date;
}

export async function fetchMarkdownFromGitHub(
  url: string,
  githubToken?: string
): Promise<FetchResult> {
  const headers: Record<string, string> = {
    'Accept': 'text/plain',
    'User-Agent': 'Anki-Interview-App',
  };

  if (githubToken) {
    headers['Authorization'] = `Bearer ${githubToken}`;
  }

  try {
    const response = await fetch(url, {
      headers,
      // Cache for 5 minutes to avoid hitting rate limits
      next: { revalidate: 300 },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch from GitHub: ${response.status} ${response.statusText}`
      );
    }

    const content = await response.text();

    return {
      content,
      source: url,
      fetchedAt: new Date(),
    };

  } catch (error) {
    console.error('GitHub fetch error:', error);
    throw new Error(`Failed to fetch markdown: ${error}`);
  }
}

export async function fetchMultipleSources(
  urls: string[],
  githubToken?: string
): Promise<FetchResult[]> {
  const promises = urls.map(url => fetchMarkdownFromGitHub(url, githubToken));
  return await Promise.all(promises);
}
```

**Acceptance Criteria:**
- [ ] Can fetch raw markdown from GitHub
- [ ] Supports GitHub authentication token
- [ ] Proper error handling
- [ ] Caching to avoid rate limits
- [ ] Supports multiple sources

### 3. OpenAI Question Parsing

#### 3.1 Create OpenAI parser
**Location:** `/src/lib/openai-parser.ts`

```typescript
import OpenAI from 'openai';

export interface ParsedQuestion {
  question: string;
  answer: string;
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const PARSING_PROMPT = `You are a helpful assistant that extracts interview questions and answers from markdown documents.

Given the markdown content, extract all question-answer pairs. Format your response as a JSON array with this structure:

[
  {
    "question": "The question text",
    "answer": "The answer text"
  }
]

Guidelines:
- Identify questions by common patterns: "Q:", "Question:", bullet points followed by "?", numbered lists
- The answer is typically the text following the question until the next question
- Clean up formatting (remove markdown symbols like *, #, etc. from content)
- Preserve code blocks in answers
- If a section doesn't have a clear answer, skip it
- Return valid JSON only, no other text

Here's the markdown content:

`;

export async function parseQuestionsWithOpenAI(
  markdown: string
): Promise<ParsedQuestion[]> {
  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a precise question-answer extractor. Always return valid JSON arrays.',
        },
        {
          role: 'user',
          content: PARSING_PROMPT + markdown,
        },
      ],
      temperature: 0.1, // Low temperature for consistent parsing
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;

    if (!content) {
      throw new Error('No content in OpenAI response');
    }

    const parsed = JSON.parse(content);

    // Handle both array response and object with array property
    const questions = Array.isArray(parsed) ? parsed : parsed.questions || [];

    // Validate structure
    return questions.filter(
      (q: any) =>
        q.question &&
        q.answer &&
        typeof q.question === 'string' &&
        typeof q.answer === 'string'
    );

  } catch (error) {
    console.error('OpenAI parsing error:', error);
    throw new Error(`Failed to parse questions: ${error}`);
  }
}

// Parse in chunks to avoid token limits
export async function parseQuestionsInChunks(
  markdown: string,
  chunkSize: number = 8000
): Promise<ParsedQuestion[]> {
  const chunks = splitMarkdownIntoChunks(markdown, chunkSize);
  const allQuestions: ParsedQuestion[] = [];

  for (const chunk of chunks) {
    const questions = await parseQuestionsWithOpenAI(chunk);
    allQuestions.push(...questions);
  }

  return allQuestions;
}

function splitMarkdownIntoChunks(content: string, maxChunkSize: number): string[] {
  const chunks: string[] = [];
  const lines = content.split('\n');
  let currentChunk = '';

  for (const line of lines) {
    if (currentChunk.length + line.length > maxChunkSize) {
      if (currentChunk) {
        chunks.push(currentChunk);
      }
      currentChunk = line;
    } else {
      currentChunk += '\n' + line;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}
```

**Dependencies:**
```bash
npm install openai
```

**Acceptance Criteria:**
- [ ] OpenAI client configured
- [ ] Parsing prompt extracts Q&A pairs
- [ ] Returns structured JSON
- [ ] Handles large documents via chunking
- [ ] Error handling for API failures
- [ ] Validates parsed structure

### 4. Database Upsert Logic

#### 4.1 Create question upsert functions
**Location:** `/src/lib/questions.ts`

```typescript
import { D1Database } from '@cloudflare/workers-types';
import { generateQuestionId } from './db';
import { Question } from '@/types/database';

export interface UpsertResult {
  inserted: number;
  updated: number;
  skipped: number;
  total: number;
}

export async function upsertQuestion(
  db: D1Database,
  question: string,
  answer: string,
  source: string
): Promise<'inserted' | 'updated'> {
  const id = generateQuestionId(question);
  const now = new Date().toISOString();

  // Check if question exists
  const existing = await db
    .prepare('SELECT id, updated_at FROM questions WHERE id = ?')
    .bind(id)
    .first<Pick<Question, 'id' | 'updated_at'>>();

  if (existing) {
    // Update existing question
    await db
      .prepare(
        `UPDATE questions
         SET answer_text = ?, source = ?, updated_at = ?
         WHERE id = ?`
      )
      .bind(answer, source, now, id)
      .run();

    return 'updated';
  } else {
    // Insert new question
    await db
      .prepare(
        `INSERT INTO questions (id, question_text, answer_text, source, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(id, question, answer, source, now, now)
      .run();

    return 'inserted';
  }
}

export async function upsertQuestions(
  db: D1Database,
  questions: Array<{ question: string; answer: string }>,
  source: string
): Promise<UpsertResult> {
  const result: UpsertResult = {
    inserted: 0,
    updated: 0,
    skipped: 0,
    total: questions.length,
  };

  for (const { question, answer } of questions) {
    try {
      const action = await upsertQuestion(db, question, answer, source);

      if (action === 'inserted') {
        result.inserted++;
      } else {
        result.updated++;
      }
    } catch (error) {
      console.error(`Failed to upsert question:`, error);
      result.skipped++;
    }
  }

  return result;
}

// Batch upsert using D1 batch API for better performance
export async function batchUpsertQuestions(
  db: D1Database,
  questions: Array<{ question: string; answer: string }>,
  source: string
): Promise<UpsertResult> {
  const result: UpsertResult = {
    inserted: 0,
    updated: 0,
    skipped: 0,
    total: questions.length,
  };

  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];

  for (const { question, answer } of questions) {
    const id = generateQuestionId(question);

    // Use INSERT OR REPLACE for simpler upsert
    statements.push(
      db.prepare(
        `INSERT OR REPLACE INTO questions
         (id, question_text, answer_text, source, created_at, updated_at)
         VALUES (?, ?, ?, ?, COALESCE((SELECT created_at FROM questions WHERE id = ?), ?), ?)`
      ).bind(id, question, answer, source, id, now, now)
    );
  }

  try {
    // Execute in batches of 100
    const batchSize = 100;
    for (let i = 0; i < statements.length; i += batchSize) {
      const batch = statements.slice(i, i + batchSize);
      await db.batch(batch);
      result.inserted += batch.length; // Simplified - actual tracking would need more logic
    }
  } catch (error) {
    console.error('Batch upsert error:', error);
    throw error;
  }

  return result;
}
```

**Acceptance Criteria:**
- [ ] Individual upsert function works
- [ ] Batch upsert for performance
- [ ] Returns statistics (inserted, updated, skipped)
- [ ] Handles errors gracefully
- [ ] Uses stable question ID (hash)

### 5. Sync API Endpoint

#### 5.1 Create sync endpoint
**Location:** `/src/app/api/sync/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { getDB } from '@/lib/db';
import { fetchMarkdownFromGitHub } from '@/lib/github';
import { parseQuestionsInChunks } from '@/lib/openai-parser';
import { batchUpsertQuestions } from '@/lib/questions';
import { getAllSources } from '@/config/sources';

export const runtime = 'edge';

export async function POST(request: NextRequest) {
  try {
    // Require authentication
    await requireSession();

    const db = getDB();
    const githubToken = process.env.GITHUB_TOKEN;

    // Get all configured sources
    const sources = getAllSources();

    if (sources.length === 0) {
      return NextResponse.json(
        { error: 'No sources configured' },
        { status: 400 }
      );
    }

    const results = [];

    for (const source of sources) {
      try {
        // 1. Fetch markdown
        const { content } = await fetchMarkdownFromGitHub(source.url, githubToken);

        // 2. Parse with OpenAI
        const questions = await parseQuestionsInChunks(content);

        // 3. Upsert to database
        const upsertResult = await batchUpsertQuestions(db, questions, source.url);

        results.push({
          source: source.name,
          ...upsertResult,
        });

      } catch (error) {
        console.error(`Failed to sync source ${source.name}:`, error);
        results.push({
          source: source.name,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // Calculate totals
    const totals = results.reduce(
      (acc, r) => {
        if (!r.error) {
          acc.inserted += r.inserted || 0;
          acc.updated += r.updated || 0;
          acc.total += r.total || 0;
        }
        return acc;
      },
      { inserted: 0, updated: 0, total: 0 }
    );

    return NextResponse.json({
      success: true,
      results,
      totals,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Sync error:', error);

    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'Sync failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
```

**Acceptance Criteria:**
- [ ] Requires authentication
- [ ] Fetches from all configured sources
- [ ] Parses with OpenAI
- [ ] Upserts to database
- [ ] Returns detailed results
- [ ] Handles errors per source
- [ ] Returns totals across all sources

#### 5.2 Create sync status endpoint
**Location:** `/src/app/api/sync/status/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { getDB } from '@/lib/db';

export const runtime = 'edge';

export async function GET() {
  try {
    await requireSession();

    const db = getDB();

    // Get total question count
    const countResult = await db
      .prepare('SELECT COUNT(*) as count FROM questions')
      .first<{ count: number }>();

    // Get most recent update
    const recentResult = await db
      .prepare('SELECT MAX(updated_at) as last_sync FROM questions')
      .first<{ last_sync: string | null }>();

    return NextResponse.json({
      totalQuestions: countResult?.count || 0,
      lastSync: recentResult?.last_sync || null,
    });

  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to get sync status' },
      { status: 500 }
    );
  }
}
```

**Acceptance Criteria:**
- [ ] Returns total question count
- [ ] Returns last sync timestamp
- [ ] Requires authentication

### 6. Testing

#### 6.1 Manual testing

**Test GitHub fetch:**
```bash
# Test fetching markdown
curl -v "https://raw.githubusercontent.com/arialdomartini/Back-End-Developer-Interview-Questions/master/README.md"
```

**Test sync endpoint:**
```bash
# Login first, then:
curl -X POST http://localhost:3000/api/sync \
  -H "Cookie: anki_session=<your-session-cookie>"
```

**Checklist:**
- [ ] Can fetch markdown from GitHub
- [ ] OpenAI parses questions correctly
- [ ] Questions inserted into database
- [ ] Duplicate questions are updated, not duplicated
- [ ] Sync endpoint returns proper statistics
- [ ] Sync status endpoint shows correct counts
- [ ] Error handling works for network failures
- [ ] Error handling works for OpenAI failures

#### 6.2 Test with sample data

Create a test file to validate parsing:

```typescript
// test/parse-sample.ts
import { parseQuestionsWithOpenAI } from '@/lib/openai-parser';

const sampleMarkdown = `
# Interview Questions

## Question 1
What is a RESTful API?

A RESTful API is an architectural style for building web services...

## Question 2
Explain database indexing

Database indexing is a technique...
`;

async function testParsing() {
  const questions = await parseQuestionsWithOpenAI(sampleMarkdown);
  console.log('Parsed questions:', JSON.stringify(questions, null, 2));
}

testParsing();
```

**Acceptance Criteria:**
- [ ] Sample markdown parses correctly
- [ ] Questions and answers separated properly
- [ ] No parsing errors

### 7. Performance Optimization

#### 7.1 Implement rate limiting

```typescript
// In sync route, add:
let lastSyncTime = 0;
const SYNC_COOLDOWN = 60000; // 1 minute

export async function POST(request: NextRequest) {
  const now = Date.now();
  if (now - lastSyncTime < SYNC_COOLDOWN) {
    return NextResponse.json(
      { error: 'Please wait before syncing again' },
      { status: 429 }
    );
  }
  lastSyncTime = now;

  // ... rest of sync logic
}
```

**Acceptance Criteria:**
- [ ] Rate limiting prevents rapid syncs
- [ ] Returns 429 Too Many Requests

#### 7.2 Add progress tracking (optional)

For long-running syncs, consider streaming responses or using a job queue.

## Success Criteria

- [x] GitHub fetcher implemented
- [x] OpenAI parser extracts Q&A pairs
- [x] Database upsert logic works
- [x] Sync API endpoint functional
- [x] Sync status endpoint works
- [x] Can sync from configured sources
- [x] Questions stored with stable IDs
- [x] Duplicate prevention works
- [x] Error handling comprehensive
- [x] Rate limiting implemented

## Error Scenarios

Handle these gracefully:
- [ ] GitHub API rate limit exceeded
- [ ] Network timeout
- [ ] Invalid markdown format
- [ ] OpenAI API failure
- [ ] Database write failure
- [ ] No sources configured
- [ ] Unauthorized access

## Next Steps

After sync is implemented:
1. Add sync button to settings page UI
2. Display sync results to user
3. Show last sync time
4. Test with real GitHub repositories
5. Monitor OpenAI token usage

## References

- [GitHub Raw Content](https://docs.github.com/en/repositories/working-with-files/using-files/viewing-a-file#viewing-or-copying-the-raw-file-content)
- [OpenAI API Documentation](https://platform.openai.com/docs/api-reference)
- [D1 Batch Operations](https://developers.cloudflare.com/d1/platform/client-api/#batch-statements)
