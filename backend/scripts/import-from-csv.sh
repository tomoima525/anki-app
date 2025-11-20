#!/bin/bash

# Import Question/Answer data from CSV files to remote D1 database
# Usage: ./scripts/import-from-csv.sh <questions_csv> <answer_logs_csv>

set -e

if [ "$#" -ne 2 ]; then
  echo "❌ Error: Missing required arguments"
  echo ""
  echo "Usage: $0 <questions_csv> <answer_logs_csv>"
  echo ""
  echo "Example:"
  echo "  $0 ../data/questions_2025-01-20.csv ../data/answer_logs_2025-01-20.csv"
  echo ""
  exit 1
fi

QUESTIONS_CSV="$1"
ANSWER_LOGS_CSV="$2"

# Validate CSV files exist
if [ ! -f "$QUESTIONS_CSV" ]; then
  echo "❌ Error: Questions CSV file not found: $QUESTIONS_CSV"
  exit 1
fi

if [ ! -f "$ANSWER_LOGS_CSV" ]; then
  echo "❌ Error: Answer logs CSV file not found: $ANSWER_LOGS_CSV"
  exit 1
fi

echo "🚀 Starting data import to remote database..."
echo ""
echo "📁 Questions CSV: $QUESTIONS_CSV"
echo "📁 Answer Logs CSV: $ANSWER_LOGS_CSV"
echo ""

# Confirm before importing to production
read -p "⚠️  This will import data to the PRODUCTION database. Continue? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "❌ Import cancelled."
  exit 0
fi

echo ""

# Create temporary SQL file for questions import
QUESTIONS_SQL="/tmp/import_questions_$$.sql"

echo "📊 Processing questions CSV..."
node -e "
const fs = require('fs');
const csv = fs.readFileSync('$QUESTIONS_CSV', 'utf-8');
const lines = csv.split('\n');

// Skip header
const header = lines[0];
const dataLines = lines.slice(1).filter(line => line.trim());

// Parse CSV (simple parser that handles quoted fields)
function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '\"') {
      if (inQuotes && nextChar === '\"') {
        current += '\"';
        i++; // Skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current);

  return values;
}

// Generate SQL
let sql = 'BEGIN TRANSACTION;\n';
let count = 0;

for (const line of dataLines) {
  const values = parseCSVLine(line);
  if (values.length >= 9) {
    const [id, question_text, answer_text, source, created_at, updated_at, last_answered_at, last_difficulty, answer_count] = values;

    // Escape single quotes for SQL
    const escape = (str) => str ? str.replace(/'/g, \"''\") : '';

    sql += \`INSERT OR REPLACE INTO questions (id, question_text, answer_text, source, created_at, updated_at, last_answered_at, last_difficulty, answer_count)
VALUES ('\${escape(id)}', '\${escape(question_text)}', '\${escape(answer_text)}', '\${escape(source)}', '\${escape(created_at)}', '\${escape(updated_at)}', \${last_answered_at ? \"'\" + escape(last_answered_at) + \"'\" : 'NULL'}, \${last_difficulty ? \"'\" + escape(last_difficulty) + \"'\" : 'NULL'}, \${answer_count || 0});\n\`;
    count++;
  }
}

sql += 'COMMIT;\n';

fs.writeFileSync('$QUESTIONS_SQL', sql, 'utf-8');
console.log('✅ Prepared ' + count + ' questions for import');
"

# Import questions to remote database
echo "📤 Importing questions to remote database..."
npx wrangler d1 execute anki-interview-db-prod --remote --file="$QUESTIONS_SQL"
echo "✅ Questions imported successfully"
echo ""

# Create temporary SQL file for answer logs import
ANSWER_LOGS_SQL="/tmp/import_answer_logs_$$.sql"

echo "📊 Processing answer logs CSV..."
node -e "
const fs = require('fs');
const csv = fs.readFileSync('$ANSWER_LOGS_CSV', 'utf-8');
const lines = csv.split('\n');

// Skip header
const header = lines[0];
const dataLines = lines.slice(1).filter(line => line.trim());

if (dataLines.length === 0) {
  console.log('⚠️  No answer logs to import');
  fs.writeFileSync('$ANSWER_LOGS_SQL', '', 'utf-8');
  process.exit(0);
}

// Parse CSV (simple parser that handles quoted fields)
function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '\"') {
      if (inQuotes && nextChar === '\"') {
        current += '\"';
        i++; // Skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current);

  return values;
}

// Generate SQL
let sql = 'BEGIN TRANSACTION;\n';
let count = 0;

for (const line of dataLines) {
  const values = parseCSVLine(line);
  if (values.length >= 4) {
    const [id, question_id, difficulty, answered_at] = values;

    // Escape single quotes for SQL
    const escape = (str) => str ? str.replace(/'/g, \"''\") : '';

    sql += \`INSERT OR REPLACE INTO answer_logs (id, question_id, difficulty, answered_at)
VALUES (\${id || 'NULL'}, '\${escape(question_id)}', '\${escape(difficulty)}', '\${escape(answered_at)}');\n\`;
    count++;
  }
}

sql += 'COMMIT;\n';

fs.writeFileSync('$ANSWER_LOGS_SQL', sql, 'utf-8');
console.log('✅ Prepared ' + count + ' answer logs for import');
"

# Import answer logs to remote database (only if file has content)
if [ -s "$ANSWER_LOGS_SQL" ]; then
  echo "📤 Importing answer logs to remote database..."
  npx wrangler d1 execute anki-interview-db-prod --remote --file="$ANSWER_LOGS_SQL"
  echo "✅ Answer logs imported successfully"
else
  echo "⚠️  No answer logs to import"
fi

# Cleanup temp files
rm -f "$QUESTIONS_SQL" "$ANSWER_LOGS_SQL"

echo ""
echo "=== Import Complete ==="
echo "✅ Data successfully imported to remote database"
echo ""
