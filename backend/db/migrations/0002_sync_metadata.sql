-- Migration: Add sync metadata tracking
-- Created: 2025-01-19

CREATE TABLE IF NOT EXISTS sync_metadata (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at DATETIME NOT NULL,
  completed_at DATETIME,
  status TEXT CHECK(status IN ('running', 'completed', 'failed')) NOT NULL,
  sources_count INTEGER,
  questions_inserted INTEGER,
  questions_updated INTEGER,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_sync_metadata_completed_at
  ON sync_metadata(completed_at DESC);

CREATE INDEX IF NOT EXISTS idx_sync_metadata_status
  ON sync_metadata(status);
