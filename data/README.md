# Data Export/Import Tools

This directory contains exports of Question/Answer data from the Anki Interview App database in both CSV and JSON formats.

## Overview

This directory supports two workflows:

### 1. GitHub Sync Workflow (JSON)
Parse questions from GitHub repositories with review before database import:
1. **Fetch & Parse** questions from GitHub to JSON files
2. **Generate Answers** with OpenAI (if not present)
3. **Review** the JSON files
4. **Upsert** reviewed data to the database

### 2. Database Export/Import (CSV)
Export and import data between local and production databases:
1. **Export** questions and answer logs from your local D1 database to CSV files
2. **Import** CSV data to your remote (production) D1 database

Both CSV and JSON files are automatically ignored by git to prevent accidentally committing large data files.

---

## GitHub Sync Workflow

This workflow allows you to fetch questions from GitHub repositories, optionally generate answers with AI, review the results, and then import them to the database.

### Prerequisites

Before running the sync scripts, ensure you have a `.env` file in the `backend/` directory with the required environment variables:

```bash
# Copy the example file
cd backend
cp .env.example .env

# Edit .env and add your keys:
# - OPENAI_API_KEY: Your OpenAI API key (for AI features)
# - GITHUB_TOKEN: Your GitHub personal access token (for fetching from private repos)
# - OPENAI_MODEL (optional): Model to use (default: gpt-4o-mini)
```

See `backend/.env.example` for the full list of required variables.

### Step 1: Fetch and Parse Questions

```bash
# From the backend directory
pnpm fetch-parse

# Or from the root directory
pnpm --filter anki-interview-backend fetch-parse
```

**What it does:**
- Fetches markdown files from configured GitHub sources (see `backend/src/config/sources.ts`)
- Detects if answers are already present in the markdown using AI
- Parses questions and answers (if present)
- Saves results to JSON files in `data/` directory:
  - Individual source files: `<source_name>_YYYY-MM-DD.json`
  - Combined file: `all_sources_YYYY-MM-DD.json`

**JSON Format:**
```json
{
  "source": "Source Name",
  "sourceUrl": "https://github.com/...",
  "questions": [
    {
      "title": "Question Title",
      "content": "Question content...",
      "answer": "Answer content...",
      "hasAnswer": true,
      "source": "Source Name",
      "sourceUrl": "https://github.com/..."
    }
  ],
  "hasAnswers": true,
  "timestamp": "2025-11-28T10:30:00.000Z"
}
```

### Step 2: Generate Answers (if needed)

If some questions don't have answers, run:

```bash
# From the backend directory
pnpm generate-answers

# Or from the root directory
pnpm --filter anki-interview-backend generate-answers
```

**What it does:**
- Reads JSON files from `data/` directory
- Identifies questions without answers (`hasAnswer: false`)
- Uses OpenAI to generate answers for those questions
- Updates the JSON files with generated answers
- Updates the combined file

### Step 3: Review the Data

Before importing to the database, review the JSON files in the `data/` directory:

1. Open the JSON files and verify:
   - Questions are correctly parsed
   - Answers are accurate and complete
   - Metadata (source, sourceUrl) is correct

2. Edit any questions/answers that need corrections

3. Check the combined file (`all_sources_YYYY-MM-DD.json`) for an overview

### Step 4: Upsert to Database

Once you've reviewed and are satisfied with the data:

```bash
# From the backend directory
pnpm upsert-data

# Or from the root directory
pnpm --filter anki-interview-backend upsert-data
```

**What it does:**
- Reads JSON files from `data/` directory
- Validates that all questions have answers
- Upserts questions to the local D1 database
- Shows summary of inserted, updated, and skipped questions

**Behavior:**
- **Insert**: New questions not in the database
- **Update**: Existing questions (matched by title + content)
- **Skip**: Questions that haven't changed

### Complete Workflow Example

```bash
# 1. Fetch questions from GitHub
cd backend
pnpm fetch-parse

# Output shows: 25 questions parsed, 10 need answers

# 2. Generate missing answers
pnpm generate-answers

# Output shows: Generated 10 answers

# 3. Review the JSON files
cat ../data/my_source_2025-11-28.json
# Edit if needed...

# 4. Upsert to database
pnpm upsert-data

# Output shows: 25 inserted, 0 updated, 0 skipped
```

### Configuring Sources

Sources are configured in `backend/src/config/sources.ts`. Add new sources:

```typescript
export function getAllSources() {
  return [
    {
      name: "My Interview Questions",
      url: "https://github.com/username/repo/blob/main/questions.md"
    },
    // Add more sources...
  ];
}
```

### Troubleshooting

**"No JSON files found in data/ directory"**
- Run `pnpm fetch-parse` first

**"Questions don't have answers"**
- Run `pnpm generate-answers` to generate missing answers
- Or manually add answers to the JSON files

**"OPENAI_API_KEY is not set"**
- Ensure you have a `.env` file in the `backend/` directory
- Add `OPENAI_API_KEY=sk-...` to the `.env` file
- See Prerequisites section above for setup instructions

**"GITHUB_TOKEN is not set"**
- Ensure you have a `.env` file in the `backend/` directory
- Add `GITHUB_TOKEN=ghp_...` to the `.env` file
- See Prerequisites section above for setup instructions

---

## CSV Export/Import

## Export Data

### Command

```bash
# From the backend directory
pnpm db:export

# Or from the root directory
pnpm --filter anki-interview-backend db:export
```

### What it does

- Exports all questions from the local database to `questions_<timestamp>.csv`
- Exports all answer logs from the local database to `answer_logs_<timestamp>.csv`
- Files are saved to `/data` directory with timestamps

### CSV Format

**questions_YYYY-MM-DDTHH-MM-SS.csv**
```csv
id,question_text,answer_text,source,created_at,updated_at,last_answered_at,last_difficulty,answer_count,source_name
seed1,What is REST?,Representational State Transfer...,api.md,2025-11-20 15:55:56,2025-11-20 15:55:56,null,null,0,API Questions
```

**Note**: The `source_name` field is optional in CSV imports. If not provided, the `source` value will be used as `source_name`.

**answer_logs_YYYY-MM-DDTHH-MM-SS.csv**
```csv
id,question_id,difficulty,answered_at
1,seed1,medium,2025-11-20 16:30:00
```

## Import Data

### Command

```bash
# From the backend directory
pnpm db:import -- ../data/questions_2025-11-20.csv

# Or from the root directory
pnpm --filter anki-interview-backend db:import -- ../data/questions_2025-11-20.csv
```

### What it does

- Reads the specified CSV file
- Converts it to SQL INSERT statements
- Imports data to the **remote (production)** D1 database
- Uses `INSERT OR REPLACE` to handle duplicates (upsert behavior)

### Safety Features

- **Confirmation prompt**: Asks for confirmation before importing to production
- **Validation**: Checks that CSV files exist before starting
- **Transaction safety**: Wraps imports in transactions for atomicity

## Use Cases

### 1. Backup local data

```bash
pnpm db:export
```

This creates timestamped CSV backups of your local database.

### 2. Migrate data to production

```bash
# Step 1: Export from local
pnpm db:export

# Step 2: Import to production
pnpm db:import -- ../data/questions_2025-11-20T15-57-22.csv
```

### 3. Share question sets

Export your questions to CSV and share them with others. They can import them into their own databases.

### 4. Data recovery

If your production database loses data, restore it from a CSV backup.

## Technical Details

### Scripts Location

- Export script: `backend/scripts/export-to-csv.sh`
- Import script: `backend/scripts/import-from-csv.sh`

### Database Configuration

Configured in `backend/wrangler.toml`:

- **Local DB**: `anki-interview-db` (used for export)
- **Production DB**: `anki-interview-db-prod` (used for import)

### CSV Escaping

Both scripts properly handle:
- Commas in text fields
- Quotes in text fields
- Newlines in text fields
- NULL values

### Dependencies

- **wrangler**: Cloudflare D1 CLI tool
- **node**: For JSON/CSV parsing
- **bash**: For script execution

## Troubleshooting

### "no such table: questions"

Run migrations first:
```bash
pnpm db:migrate
```

### "command not found: wrangler"

Install dependencies:
```bash
pnpm install
```

### "Proxy environment variables detected"

This is normal. The scripts filter out non-JSON output from wrangler.

### Empty CSV files

Check if your local database has data:
```bash
npx wrangler d1 execute anki-interview-db --local --command="SELECT COUNT(*) FROM questions"
```

If empty, seed the database:
```bash
pnpm db:seed
```

## Notes

- CSV files in this directory are git-ignored (`.gitignore` entry: `data/*.csv`)
- Timestamps use format: `YYYY-MM-DDTHH-MM-SS`
- The `.gitkeep` file ensures this directory is tracked by git even when empty
- Import uses `INSERT OR REPLACE` so you can safely re-import data without duplicates
