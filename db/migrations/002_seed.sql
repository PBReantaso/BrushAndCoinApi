INSERT INTO users (email, password_hash, role, username)
VALUES
  ('demo@brushandcoin.com', 'password123', 'patron', 'demo'),
  ('salvy@brushandcoin.com', 'password123', 'patron', 'salvy'),
  ('artist@brushandcoin.com', 'password123', 'artist', 'artist')
ON CONFLICT (email) DO NOTHING;

INSERT INTO artists (name, location, rating)
VALUES
  ('Lara Cruz', 'Quezon City', 4.9),
  ('Miguel Ramos', 'Makati', 4.7)
ON CONFLICT DO NOTHING;

INSERT INTO projects (title, client_name, status)
VALUES
  ('Portrait Commission', 'Ana Santos', 'inProgress'),
  ('Event Mural', 'Local Café', 'inquiry')
ON CONFLICT DO NOTHING;

INSERT INTO project_milestones (project_id, title, amount, is_released)
VALUES
  (1, 'Sketch Approval', 50, FALSE),
  (1, 'Final Artwork', 150, FALSE)
ON CONFLICT DO NOTHING;

INSERT INTO conversations (name, last_message, last_message_date)
VALUES
  ('Ana Santos', 'Can I commission snake pasta art?', '2026-04-02 19:47:00'),
  ('Local Café', 'I love myself. Can u draw me?', '2026-04-02 18:07:00'),
  ('Event Organizer', 'I’m sorry because I am lost', '2026-02-17 10:00:00')
ON CONFLICT DO NOTHING;

-- Remove these demo conversations since users shouldn't see conversations they haven't participated in
DELETE FROM conversations WHERE name IN ('Ana Santos', 'Local Café', 'Event Organizer', 'Demo Chat');
