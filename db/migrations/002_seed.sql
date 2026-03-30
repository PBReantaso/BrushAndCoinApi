INSERT INTO users (email, password_hash, role)
VALUES ('demo@brushandcoin.com', 'password123', 'patron')
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

INSERT INTO conversations (name)
VALUES
  ('Ana Santos'),
  ('Local Café'),
  ('Event Organizer')
ON CONFLICT DO NOTHING;
