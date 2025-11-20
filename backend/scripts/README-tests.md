# Test Scripts

This directory contains test scripts for the sync functionality.

## test-parse-prewritten.ts

Tests the `parsePrewrittenQA` function with real GitHub markdown content.

### Running the test

Since this is a Cloudflare Workers project, the test should be run in the Wrangler environment:

```bash
# Option 1: Run with wrangler (if configured as a test scheduled worker)
wrangler dev --local scripts/test-parse-prewritten.ts --test-scheduled

# Option 2: Run directly with Node.js (requires openai package to be installed)
# Note: This may not work in all environments
OPENAI_API_KEY="your-key" npx tsx scripts/test-parse-prewritten.ts
```

### Test Coverage

The test verifies:

1. **Regex-based answer detection** - Tests `hasPrewrittenAnswers()` on documents with and without answers
2. **AI-based answer detection** - Tests `hasPrewrittenAnswersWithAI()` using OpenAI API
3. **Q&A parsing** - Tests `parsePrewrittenQA()` extracts questions and answers correctly
4. **Question quality** - Verifies parsed questions have valid content
5. **Code block preservation** - Ensures code blocks in answers are preserved

### Test Data

Uses real content from:
- **JavaScript Interview Questions** (has pre-written answers)
  - Source: https://raw.githubusercontent.com/sudheerj/javascript-interview-questions/master/README.md
- **Back-End Developer Interview Questions** (questions only, no answers)
  - Source: https://raw.githubusercontent.com/arialdomartini/Back-End-Developer-Interview-Questions/master/README.md

## test-deduplication.ts

Tests the question deduplication logic that prevents duplicate questions when documents have a table of contents followed by detailed content.

### Running the test

```bash
npx tsx scripts/test-deduplication.ts
```

### Test Coverage

The test verifies:

1. **Duplicate detection** - Identifies duplicate questions with variations in punctuation and spacing
2. **Best answer selection** - Keeps the version with the longest/most complete answer
3. **Normalization** - Properly normalizes question text for comparison

### Test Scenario

Simulates a common markdown structure where:
- Table of contents lists questions at the top (with short/placeholder answers)
- Same questions appear later in the document with full answers

The deduplication logic ensures only one version of each question is kept (the one with the most complete answer).
