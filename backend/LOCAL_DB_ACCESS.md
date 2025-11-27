# Accessing Local SQLite Database in Cloudflare Development

When developing with Cloudflare Workers and D1 locally, Wrangler creates a local SQLite database file. This guide shows you multiple ways to access and interact with it.

## Prerequisites

- Wrangler CLI installed
- Local development server must be running at least once (`wrangler dev`) to create the database file

## Method 1: Using Wrangler CLI (Recommended)

The easiest and most reliable way to interact with your local D1 database is through Wrangler commands.

### Quick Commands (via npm scripts)

```bash
# Open interactive SQL shell
pnpm db:shell

# Run a SQL query
pnpm db:query "SELECT * FROM questions LIMIT 5;"

# View database info
pnpm db:info

# List all tables
pnpm db:tables
```

### Execute SQL Commands

```bash
# Run a single SQL command
npx wrangler d1 execute anki-interview-db --local \
  --command "SELECT * FROM questions LIMIT 5;"

# Execute a SQL file
npx wrangler d1 execute anki-interview-db --local \
  --file=./db/verification_queries.sql

# View table schema
npx wrangler d1 execute anki-interview-db --local \
  --command "SELECT sql FROM sqlite_master WHERE type='table';"
```

### Interactive SQL Shell

```bash
# Start an interactive SQL shell (if supported)
npx wrangler d1 execute anki-interview-db --local
```

### View Database Information

```bash
# List all local databases
npx wrangler d1 list

# Get database info
npx wrangler d1 info anki-interview-db --local
```

## Method 2: Direct SQLite File Access

The local database file is stored in the `.wrangler` directory. You can access it directly using standard SQLite tools.

### Finding the Database File

The database file is typically located at:

```
.wrangler/state/v3/d1/miniflare-D1DatabaseObject/[database-id]/db.sqlite
```

To find the exact path:

```bash
# Find the database file (macOS/Linux)
find backend/.wrangler -name "*.sqlite" -type f

# Or check the database ID from wrangler.toml
grep database_id backend/wrangler.toml
```

### Using SQLite3 CLI Tool

```bash
# Open the database with sqlite3 (replace with actual path)
sqlite3 backend/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/[database-id]/db.sqlite

# Inside sqlite3:
.tables              # List all tables
.schema questions    # Show table schema
SELECT * FROM questions LIMIT 5;
.quit
```

**Quick Access Script:**

A helper script is already available at `backend/scripts/db-shell.sh`:

```bash
# From the backend directory
pnpm db:shell

# Or directly
./scripts/db-shell.sh
```

This script automatically finds and opens your local database file in sqlite3.

### Using GUI Tools

You can open the SQLite file directly in GUI applications:

**DB Browser for SQLite** (Free, cross-platform):

- Download: https://sqlitebrowser.org/
- Open the `.sqlite` file from the `.wrangler` directory

**TablePlus** (macOS/Windows/Linux, Free with paid option):

- Download: https://tableplus.com/
- File → Open → Select the `.sqlite` file

**VS Code Extension** (SQLite Viewer):

- Install: "SQLite Viewer" extension in VS Code
- Open the `.sqlite` file in VS Code

## Method 3: Programmatic Access

You can also create Node.js scripts to interact with the database:

### Example Script: `backend/scripts/inspect-db.ts`

```typescript
import Database from "better-sqlite3";
import { resolve } from "path";
import { readdirSync, statSync } from "fs";

// Find the database file
function findDatabase(): string {
  const wranglerDir = resolve(__dirname, "../.wrangler/state/v3/d1");

  function searchDir(dir: string): string | null {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = resolve(dir, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        const result = searchDir(fullPath);
        if (result) return result;
      } else if (entry === "db.sqlite") {
        return fullPath;
      }
    }
    return null;
  }

  const dbPath = searchDir(wranglerDir);
  if (!dbPath) {
    throw new Error("Database file not found. Run 'wrangler dev' first.");
  }
  return dbPath;
}

// Open and query database
const dbPath = findDatabase();
console.log(`Opening database: ${dbPath}`);

const db = new Database(dbPath);

// Example queries
const questions = db.prepare("SELECT * FROM questions LIMIT 5").all();
console.log("Questions:", questions);

const tableInfo = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table'")
  .all();
console.log("Tables:", tableInfo);

db.close();
```

Install dependency:

```bash
cd backend
pnpm add -D better-sqlite3 @types/better-sqlite3
```

## Common Tasks

### View All Tables

```bash
npx wrangler d1 execute anki-interview-db --local \
  --command "SELECT name FROM sqlite_master WHERE type='table';"
```

### Count Records in Tables

```bash
npx wrangler d1 execute anki-interview-db --local \
  --command "SELECT
    (SELECT COUNT(*) FROM questions) as questions,
    (SELECT COUNT(*) FROM answer_logs) as answer_logs,
    (SELECT COUNT(*) FROM users) as users;"
```

### Export Database to SQL

```bash
# Using sqlite3 directly (after finding the file)
sqlite3 backend/.wrangler/.../db.sqlite .dump > backup.sql
```

### Clear All Data (Reset)

```bash
npx wrangler d1 execute anki-interview-db --local \
  --command "DELETE FROM answer_logs; DELETE FROM questions; DELETE FROM users;"
```

### View Recent Answer Logs

```bash
npx wrangler d1 execute anki-interview-db --local \
  --command "SELECT * FROM answer_logs ORDER BY answered_at DESC LIMIT 10;"
```

## Important Notes

1. **Database Location**: The `.wrangler` directory is in `.gitignore` and should not be committed to git.

2. **Database Persistence**: The local database persists between `wrangler dev` sessions. To reset it, delete the `.wrangler` directory:

   ```bash
   rm -rf backend/.wrangler
   ```

3. **File Locking**: If `wrangler dev` is running, you may not be able to open the database file directly in GUI tools due to file locking. Either:
   - Stop `wrangler dev` first
   - Use Wrangler CLI commands instead (they work even when dev server is running)

4. **Database ID**: The database ID in `wrangler.toml` must match the actual database ID for the local database to work correctly.

5. **Migrations**: Always apply migrations using Wrangler commands:
   ```bash
   pnpm db:migrate  # Applies migrations to local database
   ```

## Troubleshooting

### Database file not found

```bash
# Make sure wrangler dev has been run at least once
cd backend
pnpm dev

# In another terminal, check if file exists
find .wrangler -name "*.sqlite"
```

### Permission errors

```bash
# Check file permissions
ls -la backend/.wrangler/state/v3/d1/*/db.sqlite

# Fix permissions if needed
chmod 644 backend/.wrangler/state/v3/d1/*/db.sqlite
```

### Database locked error

- Stop any running `wrangler dev` processes
- Wait a few seconds
- Try accessing the database again

## Recommended Workflow

For day-to-day development:

1. **Use Wrangler CLI commands** for most database operations (Method 1)
2. **Use GUI tools** for complex queries and visual exploration (Method 2)
3. **Create helper scripts** for repetitive tasks (Method 3)

This gives you the flexibility to choose the best tool for each task.
