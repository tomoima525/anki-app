-- Check tables exist
SELECT name FROM sqlite_master WHERE type='table';

-- Check indexes
SELECT name FROM sqlite_master WHERE type='index';

-- Test insert
INSERT INTO questions (id, question_text, answer_text, source, created_by)
VALUES ('test123', 'What is TypeScript?', 'A typed superset of JavaScript', 'test.md', '1');

-- Test select
SELECT * FROM questions;

-- Test answer log
INSERT INTO answer_logs (question_id, difficulty, user_id)
VALUES ('test123', 'easy', '1');

-- Verify foreign key
SELECT q.question_text, al.difficulty, al.answered_at
FROM questions q
JOIN answer_logs al ON q.id = al.question_id;

-- Cleanup test data
DELETE FROM answer_logs WHERE question_id = 'test123';
DELETE FROM questions WHERE id = 'test123';
