# Backend Test Plan

## Overview

This document outlines the testing strategy for the Anki Interview App backend, which is built on Cloudflare Workers with Hono framework and D1 database.

### System Under Test

- **Framework**: Hono on Cloudflare Workers
- **Database**: Cloudflare D1 (SQLite)
- **Runtime**: Cloudflare Workers Runtime
- **API Pattern**: REST API

### Test Objectives

1. Ensure all API endpoints function correctly
2. Validate database operations and data integrity
3. Verify error handling and edge cases
4. Ensure CORS configuration works properly
5. Validate study flow logic and question selection

---

## Test Categories

### 1. Unit Tests

Test individual functions and modules in isolation.

#### 1.1 Database Utilities (`src/lib/db.ts`)

**Function: `generateQuestionId()`**

| Test Case | Input | Expected Output | Priority |
|-----------|-------|-----------------|----------|
| Generate ID for normal text | "What is React?" | SHA-256 hash string | High |
| Handle empty string | "" | SHA-256 hash of empty string | Medium |
| Trim whitespace | "  Question  " | Same hash as "Question" | High |
| Handle special characters | "What is 'this'?" | Valid SHA-256 hash | Medium |
| Consistency check | Same question twice | Identical hashes | High |
| Handle unicode | "¿Qué es React?" | Valid SHA-256 hash | Low |

#### 1.2 Question Operations (`src/lib/questions.ts`)

**Function: `upsertQuestion()`**

| Test Case | Scenario | Expected Result | Priority |
|-----------|----------|-----------------|----------|
| Insert new question | Question doesn't exist | Returns "inserted", question in DB | High |
| Update existing question | Question exists (same ID) | Returns "updated", answer updated | High |
| Update with new answer | Same question, different answer | Answer text updated | High |
| Update timestamps | Updating existing question | `updated_at` changes, `created_at` stays same | Medium |
| Handle DB errors | DB connection fails | Throws error | Medium |

**Function: `upsertQuestions()`**

| Test Case | Scenario | Expected Result | Priority |
|-----------|----------|-----------------|----------|
| Batch insert new questions | Array of 5 new questions | inserted=5, updated=0, skipped=0 | High |
| Mixed insert/update | 3 new, 2 existing questions | inserted=3, updated=2, skipped=0 | High |
| Handle partial failures | Some questions fail | Skipped count reflects failures | Medium |
| Empty array | Empty input array | total=0, all counts 0 | Low |
| Duplicate questions in batch | Same question appears twice | Handles gracefully | Medium |

**Function: `batchUpsertQuestions()`**

| Test Case | Scenario | Expected Result | Priority |
|-----------|----------|-----------------|----------|
| Batch processing | 150 questions | Processes in batches of 100 | High |
| COALESCE logic | Updates preserve created_at | created_at unchanged on update | High |
| Large batch | 500+ questions | All processed successfully | Medium |
| Performance comparison | Same data as upsertQuestions | Significantly faster | Low |

---

### 2. Integration Tests

Test API endpoints with database interactions.

#### 2.1 Health Check Endpoint

**GET `/health`**

| Test Case | Expected Response | Status Code | Priority |
|-----------|-------------------|-------------|----------|
| Health check returns OK | `{"status": "ok"}` | 200 | High |

#### 2.2 Study Flow Endpoints

**POST `/api/study/next`**

| Test Case | Setup | Expected Response | Status Code | Priority |
|-----------|-------|-------------------|-------------|----------|
| Get random question | DB has 10 questions | Question object with id, question, source | 200 | High |
| No questions available | Empty DB | `{"error": "No questions available..."}` | 404 | High |
| Response excludes answer | DB has questions | Response has no `answer` field | 200 | High |
| Random selection | Multiple calls | Different questions returned | 200 | Medium |
| DB connection error | Simulate DB failure | Error response | 500 | Medium |

**Expected Response Schema:**
```json
{
  "id": "string (SHA-256 hash)",
  "question": "string",
  "source": "string"
}
```

**GET `/api/study/:id`**

| Test Case | Setup | Expected Response | Status Code | Priority |
|-----------|-------|-------------------|-------------|----------|
| Get existing question | Valid question ID | Full question with answer | 200 | High |
| Question not found | Non-existent ID | `{"error": "Question not found"}` | 404 | High |
| Invalid ID format | Malformed ID | Error response | 404 or 500 | Medium |
| Answer included | Valid ID | Response includes `answer` field | 200 | High |
| DB error | Simulate DB failure | Error response | 500 | Medium |

**Expected Response Schema:**
```json
{
  "id": "string",
  "question": "string",
  "answer": "string",
  "source": "string"
}
```

**POST `/api/study/:id/answer`**

| Test Case | Request Body | Expected Response | Status Code | Priority |
|-----------|--------------|-------------------|-------------|----------|
| Submit valid answer - easy | `{"difficulty": "easy"}` | `{"success": true, "message": "Answer recorded"}` | 200 | High |
| Submit valid answer - medium | `{"difficulty": "medium"}` | Success response | 200 | High |
| Submit valid answer - hard | `{"difficulty": "hard"}` | Success response | 200 | High |
| Invalid difficulty value | `{"difficulty": "expert"}` | `{"error": "Invalid difficulty value"}` | 400 | High |
| Missing difficulty field | `{}` | Error response | 400 | High |
| Question not found | Valid body, bad ID | `{"error": "Question not found"}` | 404 | High |
| Invalid JSON body | Malformed JSON | Error response | 400 | Medium |
| DB transaction success | Valid request | Both answer_logs and questions updated | 200 | High |
| DB transaction failure | Simulate DB error | No partial updates | 500 | Medium |

**Database Side Effects to Verify:**
- `answer_logs` table: New row inserted with correct question_id, difficulty, and timestamp
- `questions` table:
  - `last_answered_at` updated to current timestamp
  - `last_difficulty` updated to submitted difficulty
  - `answer_count` incremented by 1

---

### 3. CORS Tests

Test cross-origin resource sharing configuration.

| Test Case | Origin Header | Expected Behavior | Priority |
|-----------|---------------|-------------------|----------|
| Localhost development | `http://localhost:3000` | Request allowed | High |
| Localhost with port | `http://localhost:5173` | Request allowed | High |
| HTTPS production URL | `https://example.com` | Request allowed | High |
| Credentials included | Any valid origin | `credentials: true` in response | Medium |
| Invalid origin | `http://malicious.com` | Default to localhost:3000 | Low |

---

### 4. Database Tests

Test database schema and constraints.

#### 4.1 Schema Validation

| Test Case | Expected Behavior | Priority |
|-----------|-------------------|----------|
| Questions table exists | Table created successfully | High |
| Answer logs table exists | Table created with foreign key | High |
| Indexes created | All 4 indexes exist | Medium |
| Primary keys | Correct primary key constraints | High |

#### 4.2 Data Integrity

| Test Case | Action | Expected Behavior | Priority |
|-----------|--------|-------------------|----------|
| Foreign key constraint | Delete question with answers | Cascade delete answer_logs | High |
| Difficulty check constraint | Insert invalid difficulty | INSERT fails | High |
| Question ID uniqueness | Insert duplicate ID | INSERT fails or updates | High |
| Default values | Insert without timestamps | Auto-populated timestamps | Medium |
| Answer count default | Insert new question | answer_count = 0 | Medium |

#### 4.3 Data Validation

| Test Case | Expected Behavior | Priority |
|-----------|-------------------|----------|
| Difficulty values | Only 'easy', 'medium', 'hard' allowed | High |
| NOT NULL constraints | Required fields cannot be null | High |
| Timestamp format | ISO 8601 format | Medium |

---

### 5. End-to-End Tests

Test complete user workflows.

#### E2E Scenario 1: Complete Study Session

```
1. POST /api/study/next → Get question A
2. GET /api/study/:id → View full question A with answer
3. POST /api/study/:id/answer → Submit difficulty rating
4. POST /api/study/next → Get different question B
5. Verify question A metadata updated in DB
```

**Validations:**
- Question A not immediately repeated
- Database correctly tracks answer history
- Timestamps are sequential

#### E2E Scenario 2: Multiple Answer Submissions

```
1. Answer same question 3 times with different difficulties
2. Verify answer_logs has 3 entries
3. Verify question.answer_count = 3
4. Verify question.last_difficulty = most recent submission
```

---

## Test Environment Setup

### Required Tools and Libraries

```json
{
  "devDependencies": {
    "vitest": "^1.0.0",
    "@cloudflare/vitest-pool-workers": "^0.1.0",
    "wrangler": "^4.0.0"
  }
}
```

### Test Database Setup

1. Use local D1 instance for testing
2. Run migrations before each test suite
3. Seed test data as needed
4. Clean database between tests

### Configuration

Create `vitest.config.ts`:
```typescript
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
      },
    },
  },
});
```

---

## Test Data

### Sample Questions for Testing

```typescript
const TEST_QUESTIONS = [
  {
    question: "What is the difference between let and const in JavaScript?",
    answer: "let allows reassignment, const does not",
    source: "github://test/javascript.md"
  },
  {
    question: "Explain React hooks",
    answer: "Functions that let you use state and lifecycle features in functional components",
    source: "github://test/react.md"
  },
  // Add 10+ more for comprehensive testing
];
```

---

## Test Execution Plan

### Phase 1: Unit Tests (Week 1)
- [x] Plan tests
- [ ] Set up testing framework
- [ ] Implement db.ts unit tests
- [ ] Implement questions.ts unit tests
- [ ] Achieve 80%+ code coverage

### Phase 2: Integration Tests (Week 2)
- [ ] Set up test database
- [ ] Implement API endpoint tests
- [ ] Test CORS configuration
- [ ] Test error scenarios

### Phase 3: Database Tests (Week 3)
- [ ] Test schema migrations
- [ ] Test data integrity
- [ ] Test constraints and validations
- [ ] Performance testing for batch operations

### Phase 4: E2E Tests (Week 4)
- [ ] Implement study flow scenarios
- [ ] Test with realistic data volumes
- [ ] Load testing
- [ ] Edge case scenarios

---

## Coverage Goals

| Category | Target Coverage | Critical Paths |
|----------|-----------------|----------------|
| Unit Tests | 85% | generateQuestionId, upsertQuestion |
| Integration Tests | 90% | All API endpoints |
| Database Operations | 80% | Insert, update, foreign keys |
| Error Handling | 100% | All error responses |

---

## Continuous Integration

### CI Pipeline Steps

1. **Lint**: Run ESLint
2. **Type Check**: Run TypeScript compiler
3. **Unit Tests**: Run all unit tests
4. **Integration Tests**: Run API tests with local D1
5. **Coverage Report**: Generate and upload coverage
6. **Deploy Preview**: Deploy to staging environment

### Success Criteria

- All tests pass
- Coverage thresholds met
- No linting errors
- Type checking passes

---

## Known Issues and Limitations

1. **Random Selection Testing**: Testing randomness is inherently difficult; focus on distribution over large samples
2. **Timestamp Testing**: Use fixed time mocks to ensure deterministic tests
3. **D1 Limitations**: Some advanced SQL features may behave differently in D1 vs standard SQLite
4. **Batch Performance**: Actual performance gains of batch operations hard to measure in test environment

---

## Future Test Enhancements

1. **Load Testing**: Test with 10,000+ questions
2. **Concurrent Requests**: Test race conditions
3. **Spaced Repetition Logic**: When implemented, test question selection algorithm
4. **Analytics**: Test aggregated statistics endpoints
5. **Authentication**: When added, test protected endpoints
6. **Rate Limiting**: Test API rate limits

---

## Appendix: Test Commands

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run specific test file
npm test -- src/lib/db.test.ts

# Run with coverage
npm test -- --coverage

# Run integration tests only
npm test -- --grep "integration"

# Run E2E tests
npm run test:e2e
```

---

## References

- [Vitest Documentation](https://vitest.dev/)
- [Cloudflare Workers Testing](https://developers.cloudflare.com/workers/testing/vitest-integration/)
- [D1 Documentation](https://developers.cloudflare.com/d1/)
- [Hono Testing Guide](https://hono.dev/guides/testing)
