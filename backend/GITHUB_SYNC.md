# GitHub Sync - User Guide

This document explains how to use the GitHub sync feature to import interview questions from GitHub repositories.

## Overview

The GitHub sync feature fetches interview questions from configured GitHub repositories, parses them using OpenAI's API, and stores them in your D1 database.

## Prerequisites

1. OpenAI API key (get one at https://platform.openai.com/api-keys)
2. Database migrations completed (`pnpm run db:migrate` from backend directory)
3. Node.js environment configured

## Setup

### 1. Configure Environment Variables

Create a `.dev.vars` file in the `backend` directory (copy from `.env.example`):

```bash
cd backend
cp .env.example .dev.vars
```

Edit `.dev.vars` and add your OpenAI API key:

```env
# Required
OPENAI_API_KEY=sk-your-actual-api-key-here

# Optional - defaults to gpt-4o-mini
OPENAI_MODEL=gpt-4o-mini

# Optional - for private repos or higher rate limits
# GITHUB_TOKEN=ghp_your_token_here
```

**Important:** Never commit `.dev.vars` to version control. It's already in `.gitignore`.

### 2. Configure Sources

Edit `backend/src/config/sources.ts` to add or modify question sources:

```typescript
export const QUESTION_SOURCES: QuestionSource[] = [
  {
    id: "backend-interview",
    name: "Back-End Developer Interview Questions",
    url: "https://raw.githubusercontent.com/arialdomartini/Back-End-Developer-Interview-Questions/master/README.md",
  },
  // Add more sources here
];
```

## Usage

### Running the Sync

From the `backend` directory:

```bash
# Sync to local database
pnpm run sync:local

# Sync to remote (production) database
pnpm run sync
```

### Testing the Parser

Test the OpenAI parser with sample data:

```bash
pnpm run test:parse
```

## How It Works

1. **Fetch**: Downloads markdown content from configured GitHub URLs
2. **Parse**: Uses OpenAI to extract question-answer pairs from the markdown
3. **Upsert**: Inserts new questions or updates existing ones (based on question hash)

## Output

The sync script provides detailed progress output:

```
Starting sync for 1 source(s)...

Processing: Back-End Developer Interview Questions
URL: https://raw.githubusercontent.com/...
  📥 Fetching markdown...
  ✓ Fetched 45230 characters
  🤖 Parsing with OpenAI...
  ✓ Parsed 127 questions
  💾 Upserting to database...
  ✓ Inserted: 127, Updated: 0, Skipped: 0

=== Sync Complete ===
Total questions: 127
Inserted: 127
Updated: 0
```

## Question ID Generation

Questions are identified by a SHA-256 hash of the question text. This means:

- Duplicate questions are automatically updated, not re-inserted
- Changing a question's text will create a new entry
- Answers can be updated without creating duplicates

## Costs

The sync uses OpenAI's API. Approximate costs (as of 2024):

- **gpt-4o-mini**: ~$0.15 per 1M input tokens
- A typical markdown file with ~50K characters ≈ ~12K tokens
- Cost per sync: < $0.01 for most repositories

## Troubleshooting

### Error: OPENAI_API_KEY is not set

Make sure you created `.dev.vars` and added your API key.

### Error: Failed to fetch from GitHub

- Check your internet connection
- Verify the GitHub URL is a raw content URL
- If using a private repo, add a GITHUB_TOKEN to `.dev.vars`

### No questions parsed

- Check the markdown format of your source
- The parser looks for common question patterns (headings, numbered lists, Q:, etc.)
- Try the `test:parse` script to debug parsing

### Database errors

- Ensure migrations are up to date: `pnpm run db:migrate`
- Check database connection in `wrangler.toml`

## Adding More Sources

1. Find a GitHub repository with interview questions
2. Get the raw content URL (e.g., `https://raw.githubusercontent.com/user/repo/branch/file.md`)
3. Add it to `backend/src/config/sources.ts`
4. Run the sync

## Production Deployment

To use in production:

1. Set secrets in Cloudflare:

   ```bash
   npx wrangler secret put OPENAI_API_KEY
   npx wrangler secret put GITHUB_TOKEN  # if needed
   ```

2. Run sync against production database:
   ```bash
   pnpm run sync
   ```

## Scheduling

To run syncs automatically, you can:

- Set up a cron trigger in `wrangler.toml`
- Use GitHub Actions to run the script periodically
- Manually run as needed

## Best Practices

1. **Test first**: Use `sync:local` before `sync` to test with local database
2. **Review sources**: Verify question quality before adding new sources
3. **Monitor costs**: Keep track of OpenAI API usage
4. **Version control**: Keep `.dev.vars` out of git, update `.env.example` with new variables
