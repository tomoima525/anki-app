#!/bin/bash

# Script to create a new database migration file
# Usage: ./scripts/create-migration.sh <migration_name>

set -e

# Check if migration name is provided
if [ -z "$1" ]; then
  echo "❌ Error: Migration name is required"
  echo "Usage: ./scripts/create-migration.sh <migration_name>"
  echo "Example: ./scripts/create-migration.sh add_user_preferences"
  exit 1
fi

MIGRATION_NAME=$1
MIGRATIONS_DIR="db/migrations"

# Create migrations directory if it doesn't exist
mkdir -p "$MIGRATIONS_DIR"

# Get the next migration number
LAST_MIGRATION=$(ls -1 "$MIGRATIONS_DIR" | tail -n 1 | grep -oE '^[0-9]+' || echo "0000")
NEXT_NUMBER=$(printf "%04d" $((10#$LAST_MIGRATION + 1)))

# Create the migration file name
MIGRATION_FILE="${MIGRATIONS_DIR}/${NEXT_NUMBER}_${MIGRATION_NAME}.sql"

# Create the migration file with template
cat > "$MIGRATION_FILE" << EOF
-- Migration: ${MIGRATION_NAME}
-- Created: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
-- Description: Add description here

-- Add your SQL statements below
-- Example:
-- CREATE TABLE IF NOT EXISTS new_table (
--   id INTEGER PRIMARY KEY AUTOINCREMENT,
--   name TEXT NOT NULL
-- );

EOF

echo "✅ Migration file created: $MIGRATION_FILE"
echo ""
echo "Next steps:"
echo "1. Edit $MIGRATION_FILE and add your SQL statements"
echo "2. Test locally: pnpm db:migrate"
echo "3. Apply to production: pnpm db:migrate:prod"
echo ""
echo "📚 Tips:"
echo "   - Always use 'IF NOT EXISTS' for CREATE TABLE statements"
echo "   - Add indexes for frequently queried columns"
echo "   - Consider adding comments to explain complex queries"
echo "   - Test migrations locally before applying to production"
