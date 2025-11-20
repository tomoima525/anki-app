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
  --command="SELECT id, question_text, answer_text, source, created_at, updated_at, last_answered_at, last_difficulty, answer_count FROM questions ORDER BY created_at DESC" \
  --json 2>&1 | sed -n '/^\[/,$ p' > /tmp/questions_export.json

# Parse JSON and create CSV
node -e "
const data = require('/tmp/questions_export.json');
const fs = require('fs');

if (!data[0] || !data[0].results) {
  console.error('No data found');
  process.exit(1);
}

const results = data[0].results;

// CSV escape function
function escapeCSV(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('\"') || str.includes('\n')) {
    return '\"' + str.replace(/\"/g, '\"\"') + '\"';
  }
  return str;
}

// Headers
const headers = ['id', 'question_text', 'answer_text', 'source', 'created_at', 'updated_at', 'last_answered_at', 'last_difficulty', 'answer_count'];
let csv = headers.join(',') + '\n';

// Data rows
for (const row of results) {
  csv += headers.map(h => escapeCSV(row[h])).join(',') + '\n';
}

fs.writeFileSync('$QUESTIONS_FILE', csv, 'utf-8');
console.log('✅ Exported ' + results.length + ' questions to: $QUESTIONS_FILE');
"

# Export Answer Logs
echo "📊 Exporting answer logs..."
ANSWER_LOGS_FILE="$DATA_DIR/answer_logs_${TIMESTAMP}.csv"

npx wrangler d1 execute anki-interview-db --local \
  --command="SELECT id, question_id, difficulty, answered_at FROM answer_logs ORDER BY answered_at DESC" \
  --json 2>&1 | sed -n '/^\[/,$ p' > /tmp/answer_logs_export.json

node -e "
const data = require('/tmp/answer_logs_export.json');
const fs = require('fs');

if (!data[0] || !data[0].results) {
  console.log('No answer logs found');
  fs.writeFileSync('$ANSWER_LOGS_FILE', 'id,question_id,difficulty,answered_at\n', 'utf-8');
  console.log('✅ Exported 0 answer logs to: $ANSWER_LOGS_FILE');
  process.exit(0);
}

const results = data[0].results;

// CSV escape function
function escapeCSV(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('\"') || str.includes('\n')) {
    return '\"' + str.replace(/\"/g, '\"\"') + '\"';
  }
  return str;
}

// Headers
const headers = ['id', 'question_id', 'difficulty', 'answered_at'];
let csv = headers.join(',') + '\n';

// Data rows
for (const row of results) {
  csv += headers.map(h => escapeCSV(row[h])).join(',') + '\n';
}

fs.writeFileSync('$ANSWER_LOGS_FILE', csv, 'utf-8');
console.log('✅ Exported ' + results.length + ' answer logs to: $ANSWER_LOGS_FILE');
"

# Cleanup temp files
rm -f /tmp/questions_export.json /tmp/answer_logs_export.json

echo ""
echo "=== Export Complete ==="
echo "📁 Files saved to: $DATA_DIR"
echo "  - questions_${TIMESTAMP}.csv"
echo "  - answer_logs_${TIMESTAMP}.csv"
echo ""
