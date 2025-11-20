# Data Export/Import Tools

This directory contains CSV exports of Question/Answer data from the Anki Interview App database.

## Overview

The export/import tools allow you to:
1. **Export** questions and answer logs from your local D1 database to CSV files
2. **Import** CSV data to your remote (production) D1 database

CSV files are automatically ignored by git to prevent accidentally committing large data files.

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
id,question_text,answer_text,source,created_at,updated_at,last_answered_at,last_difficulty,answer_count
seed1,What is REST?,Representational State Transfer...,api.md,2025-11-20 15:55:56,2025-11-20 15:55:56,null,null,0
```

**answer_logs_YYYY-MM-DDTHH-MM-SS.csv**
```csv
id,question_id,difficulty,answered_at
1,seed1,medium,2025-11-20 16:30:00
```

## Import Data

### Command

```bash
# From the backend directory
pnpm db:import -- ../data/questions_2025-11-20.csv ../data/answer_logs_2025-11-20.csv

# Or from the root directory
pnpm --filter anki-interview-backend db:import -- ../data/questions_2025-11-20.csv ../data/answer_logs_2025-11-20.csv
```

### What it does

- Reads the specified CSV files
- Converts them to SQL INSERT statements
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
pnpm db:import -- ../data/questions_2025-11-20T15-57-22.csv ../data/answer_logs_2025-11-20T15-57-22.csv
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
