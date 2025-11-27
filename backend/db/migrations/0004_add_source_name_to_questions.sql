-- Migration 0004: Add source_name field to questions table
-- Adds a human-readable source name to complement the source URL

ALTER TABLE questions ADD COLUMN source_name TEXT;

-- Create index for filtering by source name
CREATE INDEX idx_questions_source_name ON questions(source_name);
