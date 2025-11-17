# GitHub Sync Implementation Spec

## Overview
This document describes how to implement a local script to fetch interview questions from GitHub repositories, parse them using OpenAI API, and store them in the database. The sync runs as a standalone script on your local machine, not as an API endpoint.

## Prerequisites
- Database setup completed
- OpenAI API access configured
- Node.js and npm installed locally

## Source Repository

**Example:** [Back-End-Developer-Interview-Questions](https://github.com/arialdomartini/Back-End-Developer-Interview-Questions)

## Implementation Tasks

### 1. Configuration

#### 1.1 Define GitHub source configuration
**Location:** `backend/src/config/sources.ts`

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
**Location:** `backend/.dev.vars` (for local development)

```env
# OpenAI Configuration
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini

# GitHub Configuration (optional)
GITHUB_TOKEN=ghp_... # Optional, for private repos or higher rate limits

# Database Configuration
DATABASE=your-d1-database
```

**For production (Cloudflare):**
```bash
# Set secrets in Cloudflare
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put GITHUB_TOKEN  # if needed
```

**Tasks:**
- [ ] Add OpenAI API key to .dev.vars
- [ ] Configure OpenAI model to use
- [ ] Optionally add GitHub token
- [ ] Ensure .dev.vars is in .gitignore

### 2. Markdown Fetching

#### 2.1 Create GitHub fetcher utility
**Location:** `backend/src/lib/github.ts`

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
    const response = await fetch(url, { headers });

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
- [ ] Supports multiple sources

### 3. OpenAI Question Parsing

#### 3.1 Create OpenAI parser
**Location:** `backend/src/lib/openai-parser.ts`

```typescript
import OpenAI from 'openai';

export interface ParsedQuestion {
  question: string;
  answer: string;
}

const PARSING_PROMPT = `You are a helpful assistant that extracts interview questions and answers from markdown documents.

Given the markdown content, extract all question-answer pairs. Format your response as a JSON array with this structure:

{
  "questions": [
    {
      "question": "The question text",
      "answer": "The answer text"
    }
  ]
}

Guidelines:
- Identify questions by common patterns: "Q:", "Question:", bullet points followed by "?", numbered lists, section headings
- The answer is typically the text following the question until the next question
- Clean up formatting (remove markdown symbols like *, #, etc. from content)
- Preserve code blocks in answers
- If a section doesn't have a clear answer, skip it
- Return valid JSON only, no other text

Here's the markdown content:

`;

export async function parseQuestionsWithOpenAI(
  markdown: string,
  apiKey: string,
  model: string = 'gpt-4o-mini'
): Promise<ParsedQuestion[]> {
  const openai = new OpenAI({ apiKey });

  try {
    const response = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: 'You are a precise question-answer extractor. Always return valid JSON.',
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
  apiKey: string,
  model: string = 'gpt-4o-mini',
  chunkSize: number = 8000
): Promise<ParsedQuestion[]> {
  const chunks = splitMarkdownIntoChunks(markdown, chunkSize);
  const allQuestions: ParsedQuestion[] = [];

  for (const chunk of chunks) {
    const questions = await parseQuestionsWithOpenAI(chunk, apiKey, model);
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
npm install openai --workspace=backend
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
**Location:** `backend/src/lib/questions.ts`

```typescript
import { generateQuestionId } from './db';
import { Question } from '../types/database';

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
  const statements = [];

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

### 5. Sync Script

#### 5.1 Create the main sync script
**Location:** `backend/scripts/sync-github.ts`

```typescript
import { fetchMarkdownFromGitHub } from '../src/lib/github';
import { parseQuestionsInChunks } from '../src/lib/openai-parser';
import { batchUpsertQuestions } from '../src/lib/questions';
import { getAllSources } from '../src/config/sources';

interface Env {
  DB: D1Database;
  OPENAI_API_KEY: string;
  OPENAI_MODEL?: string;
  GITHUB_TOKEN?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const db = env.DB;
    const githubToken = env.GITHUB_TOKEN;
    const apiKey = env.OPENAI_API_KEY;
    const model = env.OPENAI_MODEL || 'gpt-4o-mini';

    if (!apiKey) {
      console.error('Error: OPENAI_API_KEY is not set');
      return new Response('Error: OPENAI_API_KEY is not set', { status: 500 });
    }

    // Get all configured sources
    const sources = getAllSources();

    if (sources.length === 0) {
      console.error('Error: No sources configured');
      return new Response('Error: No sources configured', { status: 400 });
    }

    console.log(`Starting sync for ${sources.length} source(s)...\n`);

    const results = [];

    for (const source of sources) {
      console.log(`Processing: ${source.name}`);
      console.log(`URL: ${source.url}`);

      try {
        // 1. Fetch markdown
        console.log('  📥 Fetching markdown...');
        const { content } = await fetchMarkdownFromGitHub(source.url, githubToken);
        console.log(`  ✓ Fetched ${content.length} characters`);

        // 2. Parse with OpenAI
        console.log('  🤖 Parsing with OpenAI...');
        const questions = await parseQuestionsInChunks(content, apiKey, model);
        console.log(`  ✓ Parsed ${questions.length} questions`);

        // 3. Upsert to database
        console.log('  💾 Upserting to database...');
        const upsertResult = await batchUpsertQuestions(db, questions, source.url);
        console.log(`  ✓ Inserted: ${upsertResult.inserted}, Updated: ${upsertResult.updated}, Skipped: ${upsertResult.skipped}`);

        results.push({
          source: source.name,
          ...upsertResult,
        });

      } catch (error) {
        console.error(`  ✗ Failed to sync source ${source.name}:`, error);
        results.push({
          source: source.name,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      console.log('');
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

    console.log('=== Sync Complete ===');
    console.log(`Total questions: ${totals.total}`);
    console.log(`Inserted: ${totals.inserted}`);
    console.log(`Updated: ${totals.updated}`);

    const response = {
      success: true,
      results,
      totals,
      timestamp: new Date().toISOString(),
    };

    return new Response(JSON.stringify(response, null, 2), {
      headers: { 'Content-Type': 'application/json' },
    });
  },
};
```

**Acceptance Criteria:**
- [ ] Fetches from all configured sources
- [ ] Parses with OpenAI
- [ ] Upserts to database
- [ ] Returns detailed results
- [ ] Handles errors per source
- [ ] Returns totals across all sources
- [ ] Provides progress output

#### 5.2 Add npm script for easy execution
**Location:** `backend/package.json`

Add to the scripts section:

```json
{
  "scripts": {
    "sync": "wrangler dev --local scripts/sync-github.ts --test-scheduled"
  }
}
```

Or for remote execution against production database:

```json
{
  "scripts": {
    "sync": "wrangler dev scripts/sync-github.ts --remote --test-scheduled",
    "sync:local": "wrangler dev --local scripts/sync-github.ts --test-scheduled"
  }
}
```

**Acceptance Criteria:**
- [ ] Script can be run with npm command
- [ ] Works with local D1 database
- [ ] Works with remote D1 database

### 6. Running the Script

#### 6.1 Local execution (development)

```bash
# Navigate to backend directory
cd backend

# Install dependencies if not already done
npm install

# Ensure .dev.vars is configured with OPENAI_API_KEY

# Run the sync script against local database
npm run sync:local

# Or run against remote database
npm run sync
```

#### 6.2 Manual execution with wrangler

```bash
# From backend directory
npx wrangler dev --local scripts/sync-github.ts --test-scheduled
```

This will:
1. Load environment variables from `.dev.vars`
2. Connect to your local D1 database
3. Execute the sync script
4. Display progress and results in the console

**Acceptance Criteria:**
- [ ] Script runs successfully from command line
- [ ] Progress is displayed during execution
- [ ] Results summary is shown at the end
- [ ] Questions are inserted into database

### 7. Testing

#### 7.1 Manual testing

**Test GitHub fetch:**
```bash
# Test fetching markdown directly
curl -v "https://raw.githubusercontent.com/arialdomartini/Back-End-Developer-Interview-Questions/master/README.md"
```

**Verify database after sync:**
```bash
# From backend directory
npx wrangler d1 execute anki-db --local --command "SELECT COUNT(*) FROM questions"
npx wrangler d1 execute anki-db --local --command "SELECT * FROM questions LIMIT 5"
```

**Checklist:**
- [ ] Can fetch markdown from GitHub
- [ ] OpenAI parses questions correctly
- [ ] Questions inserted into database
- [ ] Duplicate questions are updated, not duplicated
- [ ] Script returns proper statistics
- [ ] Error handling works for network failures
- [ ] Error handling works for OpenAI failures

#### 7.2 Test with sample data

Create a test file to validate parsing:

**Location:** `backend/scripts/test-parse.ts`

```typescript
import { parseQuestionsWithOpenAI } from '../src/lib/openai-parser';

const sampleMarkdown = `
# Interview Questions

## Question 1
What is a RESTful API?

A RESTful API is an architectural style for building web services...

## Question 2
Explain database indexing

Database indexing is a technique...
`;

interface Env {
  OPENAI_API_KEY: string;
  OPENAI_MODEL?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const apiKey = env.OPENAI_API_KEY;
    const model = env.OPENAI_MODEL || 'gpt-4o-mini';

    try {
      console.log('Testing OpenAI parsing...\n');
      const questions = await parseQuestionsWithOpenAI(sampleMarkdown, apiKey, model);
      console.log('Parsed questions:', JSON.stringify(questions, null, 2));

      return new Response(JSON.stringify(questions, null, 2), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      console.error('Error:', error);
      return new Response(`Error: ${error}`, { status: 500 });
    }
  },
};
```

**Run test:**
```bash
npx wrangler dev --local scripts/test-parse.ts --test-scheduled
```

**Acceptance Criteria:**
- [ ] Sample markdown parses correctly
- [ ] Questions and answers separated properly
- [ ] No parsing errors

### 8. Production Deployment

#### 8.1 Set up production secrets

```bash
# From backend directory
cd backend

# Set OpenAI API key in Cloudflare
npx wrangler secret put OPENAI_API_KEY
# Enter your API key when prompted

# Optionally set GitHub token
npx wrangler secret put GITHUB_TOKEN
# Enter your token when prompted
```

#### 8.2 Run sync against production database

```bash
# From backend directory
npm run sync
# This runs: wrangler dev scripts/sync-github.ts --remote --test-scheduled
```

**Acceptance Criteria:**
- [ ] Production secrets configured
- [ ] Can sync to production database
- [ ] Questions visible in production

## Success Criteria

- [ ] Configuration file created with sources
- [ ] GitHub fetcher implemented
- [ ] OpenAI parser extracts Q&A pairs
- [ ] Database upsert logic works
- [ ] Sync script functional
- [ ] Can run sync locally
- [ ] Can sync to production
- [ ] Questions stored with stable IDs
- [ ] Duplicate prevention works
- [ ] Error handling comprehensive
- [ ] Progress output is clear

## Error Scenarios

Handle these gracefully:
- [ ] GitHub API rate limit exceeded
- [ ] Network timeout
- [ ] Invalid markdown format
- [ ] OpenAI API failure
- [ ] Database write failure
- [ ] No sources configured
- [ ] Missing API keys

## Workflow Summary

1. **Configure Sources**: Add GitHub repository URLs to `backend/src/config/sources.ts`
2. **Set Environment Variables**: Add `OPENAI_API_KEY` to `backend/.dev.vars`
3. **Run Sync Script**: Execute `npm run sync:local` from backend directory
4. **Script Flow**:
   - Fetches markdown from each configured GitHub source
   - Parses markdown into Q&A pairs using OpenAI
   - Upserts questions to D1 database (insert new, update existing)
   - Outputs progress and summary statistics
5. **Verify**: Check database to confirm questions were imported

## Next Steps

After sync script is implemented:
1. Test with real GitHub repositories
2. Monitor OpenAI token usage and costs
3. Consider adding scheduled runs (cron trigger)
4. Add more question sources to config
5. Optionally create a web UI to trigger syncs

## References

- [GitHub Raw Content](https://docs.github.com/en/repositories/working-with-files/using-files/viewing-a-file#viewing-or-copying-the-raw-file-content)
- [OpenAI API Documentation](https://platform.openai.com/docs/api-reference)
- [D1 Batch Operations](https://developers.cloudflare.com/d1/platform/client-api/#batch-statements)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)
