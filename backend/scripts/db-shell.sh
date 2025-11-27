#!/bin/bash
# Quick access script to open local SQLite database in sqlite3 CLI

# Navigate to backend directory (script location)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
cd "$BACKEND_DIR"

# Find the database file
DB_FILE=$(find .wrangler -name "*.sqlite" -type f 2>/dev/null | head -1)

if [ -z "$DB_FILE" ]; then
  echo "❌ Database file not found."
  echo ""
  echo "Make sure you've run 'wrangler dev' at least once to create the database."
  echo ""
  echo "Expected location: .wrangler/state/v3/d1/*/db.sqlite"
  exit 1
fi

echo "📁 Opening database: $DB_FILE"
echo ""
echo "💡 Useful commands:"
echo "   .tables              - List all tables"
echo "   .schema <table>      - Show table schema"
echo "   .mode column         - Format output as columns"
echo "   .headers on          - Show column headers"
echo "   .quit                - Exit"
echo ""
echo "---"
echo ""

sqlite3 "$DB_FILE"

