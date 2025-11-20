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
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "📊 Processing questions CSV..."
npx tsx "$SCRIPT_DIR/lib/csv-import.ts" questions "$QUESTIONS_CSV" "$QUESTIONS_SQL"

# Import questions to remote database
echo "📤 Importing questions to remote database..."
npx wrangler d1 execute anki-interview-db-prod --remote --file="$QUESTIONS_SQL"
echo "✅ Questions imported successfully"
echo ""

# Create temporary SQL file for answer logs import
ANSWER_LOGS_SQL="/tmp/import_answer_logs_$$.sql"

echo "📊 Processing answer logs CSV..."
npx tsx "$SCRIPT_DIR/lib/csv-import.ts" answer_logs "$ANSWER_LOGS_CSV" "$ANSWER_LOGS_SQL"

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
