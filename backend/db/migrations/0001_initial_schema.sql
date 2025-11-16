-- Questions table
CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,                    -- SHA256 hash of question_text
  question_text TEXT NOT NULL,
  answer_text TEXT NOT NULL,
  source TEXT NOT NULL,                   -- GitHub file path
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_answered_at DATETIME,
  last_difficulty TEXT CHECK(last_difficulty IN ('easy', 'medium', 'hard')),
  answer_count INTEGER DEFAULT 0
);

-- Answer logs table
CREATE TABLE IF NOT EXISTS answer_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id TEXT NOT NULL,
  difficulty TEXT NOT NULL CHECK(difficulty IN ('easy', 'medium', 'hard')),
  answered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_questions_last_answered
  ON questions(last_answered_at DESC);

CREATE INDEX IF NOT EXISTS idx_questions_last_difficulty
  ON questions(last_difficulty);

CREATE INDEX IF NOT EXISTS idx_answer_logs_question_id
  ON answer_logs(question_id);

CREATE INDEX IF NOT EXISTS idx_answer_logs_answered_at
  ON answer_logs(answered_at DESC);
