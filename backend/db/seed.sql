INSERT INTO users (id, email, name, picture, google_id, is_admin) VALUES
('1', 'test@test.com', 'Test User', 'https://example.com/picture.jpg', 'test123', 0);
INSERT INTO questions (id, question_text, answer_text, source, source_name, created_by) VALUES
('seed1', 'What is REST?', 'Representational State Transfer...', 'api.md', 'API', '1'),
('seed2', 'Explain closures', 'A closure is a function...', 'javascript.md', 'JavaScript', '1');
