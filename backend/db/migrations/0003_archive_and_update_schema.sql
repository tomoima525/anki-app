-- Migration 0003: Archive existing data and create multi-tenant schema
-- Archives existing single-tenant tables and creates new tables with user isolation

-- Archive existing tables
ALTER TABLE questions RENAME TO questions_archive;
ALTER TABLE answer_logs RENAME TO answer_logs_archive;

-- Create new questions table (shared across all users)
CREATE TABLE questions (
  id TEXT PRIMARY KEY,
  question_text TEXT NOT NULL,
  answer_text TEXT NOT NULL,
  source TEXT NOT NULL,
  created_by TEXT,  -- Admin user who created/imported the question (for audit)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Create new answer_logs table with user_id
CREATE TABLE answer_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  difficulty TEXT NOT NULL CHECK(difficulty IN ('easy', 'medium', 'hard')),
  answered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);

-- Create user_question_stats table for per-user question statistics
CREATE TABLE user_question_stats (
  user_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  last_answered_at DATETIME,
  last_difficulty TEXT CHECK(last_difficulty IN ('easy', 'medium', 'hard')),
  answer_count INTEGER DEFAULT 0,
  PRIMARY KEY (user_id, question_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX idx_questions_created_by ON questions(created_by);
CREATE INDEX idx_answer_logs_user_id ON answer_logs(user_id);
CREATE INDEX idx_answer_logs_user_question ON answer_logs(user_id, question_id);
CREATE INDEX idx_user_question_stats_last_answered ON user_question_stats(user_id, last_answered_at DESC);
