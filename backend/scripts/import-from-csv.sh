#!/bin/bash

# Import Question/Answer data from CSV files to remote D1 database
# Usage: ./scripts/import-from-csv.sh <questions_csv>

set -e

if [ "$#" -ne 1 ]; then
  echo "❌ Error: Missing required arguments"
  echo ""
  echo "Usage: $0 <questions_csv>"
  echo ""
  echo "Example:"
  echo "  $0 ../data/questions_2025-01-20.csv"
  echo ""
  exit 1
fi

QUESTIONS_CSV="$1"

# Validate CSV file exists
if [ ! -f "$QUESTIONS_CSV" ]; then
  echo "❌ Error: Questions CSV file not found: $QUESTIONS_CSV"
  exit 1
fi

echo "🚀 Starting data import to remote database..."
echo ""
echo "📁 Questions CSV: $QUESTIONS_CSV"
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

# Cleanup temp files
rm -f "$QUESTIONS_SQL"

echo ""
echo "=== Import Complete ==="
echo "✅ Data successfully imported to remote database"
echo ""
