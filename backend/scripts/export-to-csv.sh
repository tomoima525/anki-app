#!/bin/bash

# Export Question/Answer data from local D1 database to CSV files
# Usage: ./scripts/export-to-csv.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)/data"
TIMESTAMP=$(date +"%Y-%m-%dT%H-%M-%S")

echo "🚀 Starting data export from local database..."
echo ""

# Ensure data directory exists
mkdir -p "$DATA_DIR"

# Export Questions
echo "📊 Exporting questions..."
QUESTIONS_FILE="$DATA_DIR/questions_${TIMESTAMP}.csv"

# Get questions data as JSON and convert to CSV
npx wrangler d1 execute anki-interview-db --local \
  --command="SELECT id, question_text, answer_text, source, created_at, updated_at, last_answered_at, last_difficulty, answer_count, source_name FROM questions ORDER BY created_at DESC" \
  --json 2>&1 | sed -n '/^\[/,$ p' > /tmp/questions_export.json

# Convert JSON to CSV using TypeScript module
npx tsx "$SCRIPT_DIR/lib/csv-export.ts" questions /tmp/questions_export.json "$QUESTIONS_FILE"

# Export Answer Logs
echo "📊 Exporting answer logs..."
ANSWER_LOGS_FILE="$DATA_DIR/answer_logs_${TIMESTAMP}.csv"

npx wrangler d1 execute anki-interview-db --local \
  --command="SELECT id, question_id, difficulty, answered_at FROM answer_logs ORDER BY answered_at DESC" \
  --json 2>&1 | sed -n '/^\[/,$ p' > /tmp/answer_logs_export.json

# Convert JSON to CSV using TypeScript module
npx tsx "$SCRIPT_DIR/lib/csv-export.ts" answer_logs /tmp/answer_logs_export.json "$ANSWER_LOGS_FILE"

# Cleanup temp files
rm -f /tmp/questions_export.json /tmp/answer_logs_export.json

echo ""
echo "=== Export Complete ==="
echo "📁 Files saved to: $DATA_DIR"
echo "  - questions_${TIMESTAMP}.csv"
echo "  - answer_logs_${TIMESTAMP}.csv"
echo ""
