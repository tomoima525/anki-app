# Database Setup Implementation Spec

## Overview

Set up Cloudflare D1 database with proper schema, migrations, and type-safe access for the flashcard application.

## Prerequisites

- Cloudflare account with D1 access
- Wrangler CLI installed (`npm install -g wrangler`)
- Next.js project initialized

## Implementation Tasks

### 1. Database Schema Design

#### 1.1 Create schema.sql file

**Location:** `/db/schema.sql`

```sql
-- Questions table
CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,                    -- SHA256 hash of question_text
  question_text TEXT NOT NULL,
  answer_text TEXT NOT NULL,
  source TEXT NOT NULL,                   -- GitHub file path
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_answered_at DATETIME,
  last_difficulty TEXT CHECK(last_difficulty IN ('easy', 'medium', 'hard')),
  answer_count INTEGER DEFAULT 0
);

-- Answer logs table
CREATE TABLE IF NOT EXISTS answer_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id TEXT NOT NULL,
  difficulty TEXT NOT NULL CHECK(difficulty IN ('easy', 'medium', 'hard')),
  answered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_questions_last_answered
  ON questions(last_answered_at DESC);

CREATE INDEX IF NOT EXISTS idx_questions_last_difficulty
  ON questions(last_difficulty);

CREATE INDEX IF NOT EXISTS idx_answer_logs_question_id
  ON answer_logs(question_id);

CREATE INDEX IF NOT EXISTS idx_answer_logs_answered_at
  ON answer_logs(answered_at DESC);
```

**Acceptance Criteria:**

- [ ] Schema file created with both tables
- [ ] Primary keys defined correctly
- [ ] Foreign key constraint on answer_logs
- [ ] Check constraints for difficulty values
- [ ] Indexes created for common queries

#### 1.2 Create migration file

**Location:** `/db/migrations/0001_initial_schema.sql`

Same content as schema.sql above, but structured as a migration.

**Acceptance Criteria:**

- [ ] Migration file follows D1 migration naming convention
- [ ] Migration is idempotent (uses IF NOT EXISTS)

### 2. Wrangler Configuration

#### 2.1 Configure wrangler.toml

**Location:** `/wrangler.toml`

```toml
name = "anki-interview-app"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "anki-interview-db"
database_id = "<will-be-generated>"
migrations_dir = "db/migrations"

[env.production]
[[env.production.d1_databases]]
binding = "DB"
database_name = "anki-interview-db-prod"
database_id = "<will-be-generated>"
```

**Tasks:**

- [ ] Create wrangler.toml if not exists
- [ ] Add D1 database binding
- [ ] Configure migrations directory
- [ ] Set up production environment

#### 2.2 Create D1 database instances

**Commands:**

```bash
# Create local development database
npx wrangler d1 create anki-interview-db

# Create production database
npx wrangler d1 create anki-interview-db-prod
```

**Tasks:**

- [ ] Run database creation commands
- [ ] Copy generated database_id values to wrangler.toml
- [ ] Verify databases exist: `npx wrangler d1 list`

**Acceptance Criteria:**

- [ ] Local database created
- [ ] Production database created
- [ ] Database IDs stored in wrangler.toml

### 3. Run Migrations

#### 3.1 Apply migrations locally

```bash
# Apply to local database
npx wrangler d1 migrations apply anki-interview-db --local

# Verify migration
npx wrangler d1 execute anki-interview-db --local \
  --command "SELECT name FROM sqlite_master WHERE type='table';"
```

**Acceptance Criteria:**

- [ ] Migration runs without errors
- [ ] Both tables created
- [ ] Indexes created

#### 3.2 Apply migrations to production

```bash
# Apply to production database
npx wrangler d1 migrations apply anki-interview-db-prod --remote
```

**Acceptance Criteria:**

- [ ] Production migration successful
- [ ] Tables verified in production

### 4. Database Access Layer

#### 4.1 Create TypeScript types

**Location:** `/src/types/database.ts`

```typescript
export interface Question {
  id: string;
  question_text: string;
  answer_text: string;
  source: string;
  created_at: string;
  updated_at: string;
  last_answered_at: string | null;
  last_difficulty: "easy" | "medium" | "hard" | null;
  answer_count: number;
}

export interface AnswerLog {
  id: number;
  question_id: string;
  difficulty: "easy" | "medium" | "hard";
  answered_at: string;
}

export type Difficulty = "easy" | "medium" | "hard";

export interface QuestionWithLogs extends Question {
  recent_logs: AnswerLog[];
}
```

**Acceptance Criteria:**

- [ ] Types match database schema exactly
- [ ] Export all necessary types
- [ ] Proper TypeScript strictness

#### 4.2 Create database utility functions

**Location:** `/src/lib/db.ts`

```typescript
import { D1Database } from "@cloudflare/workers-types";
import crypto from "crypto";

export function generateQuestionId(questionText: string): string {
  return crypto.createHash("sha256").update(questionText.trim()).digest("hex");
}

export function getDB(): D1Database {
  // Access binding from Cloudflare context
  // This will be environment-specific
  if (typeof process.env.DB !== "undefined") {
    return process.env.DB as D1Database;
  }
  throw new Error("Database binding not available");
}
```

**Acceptance Criteria:**

- [ ] Question ID generation is deterministic
- [ ] Database access helper created
- [ ] Proper error handling

### 5. Testing & Validation

#### 5.1 Manual verification queries

```sql
-- Check tables exist
SELECT name FROM sqlite_master WHERE type='table';

-- Check indexes
SELECT name FROM sqlite_master WHERE type='index';

-- Test insert
INSERT INTO questions (id, question_text, answer_text, source)
VALUES ('test123', 'What is TypeScript?', 'A typed superset of JavaScript', 'test.md');

-- Test select
SELECT * FROM questions;

-- Test answer log
INSERT INTO answer_logs (question_id, difficulty)
VALUES ('test123', 'easy');

-- Verify foreign key
SELECT q.question_text, al.difficulty, al.answered_at
FROM questions q
JOIN answer_logs al ON q.id = al.question_id;

-- Cleanup test data
DELETE FROM answer_logs WHERE question_id = 'test123';
DELETE FROM questions WHERE id = 'test123';
```

**Tasks:**

- [ ] Run all test queries locally
- [ ] Verify constraints work (try invalid difficulty)
- [ ] Verify foreign key cascade on delete
- [ ] Clean up test data

#### 5.2 Create seed data (optional for development)

**Location:** `/db/seed.sql`

```sql
INSERT INTO questions (id, question_text, answer_text, source) VALUES
('seed1', 'What is REST?', 'Representational State Transfer...', 'api.md'),
('seed2', 'Explain closures', 'A closure is a function...', 'javascript.md');
```

**Acceptance Criteria:**

- [ ] Seed file created with sample questions
- [ ] Seed data can be applied: `npx wrangler d1 execute anki-interview-db --local --file=./db/seed.sql`

## Rollback Plan

If issues occur:

```bash
# Drop all tables (local)
npx wrangler d1 execute anki-interview-db --local \
  --command "DROP TABLE IF EXISTS answer_logs; DROP TABLE IF EXISTS questions;"

# Re-run migration
npx wrangler d1 migrations apply anki-interview-db --local
```

## Success Criteria

- [x] D1 databases created (local + production)
- [x] Schema migration runs successfully
- [x] All tables and indexes created
- [x] TypeScript types defined
- [x] Database utility functions created
- [x] Manual testing completed
- [x] Can insert and query data
- [x] Foreign key constraints work
- [x] Check constraints validated

## Next Steps

After database setup is complete:

1. Proceed to authentication implementation
2. Build API routes that use these database tables
3. Implement query functions for each API endpoint

## References

- [Cloudflare D1 Documentation](https://developers.cloudflare.com/d1/)
- [D1 Migrations Guide](https://developers.cloudflare.com/d1/platform/migrations/)
- [SQLite CHECK Constraints](https://www.sqlite.org/lang_createtable.html#check_constraints)
