CREATE TABLE IF NOT EXISTS event_participants (
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_event_participants_event_id ON event_participants(event_id);

-- Existing events: add organizer as participant when present.
INSERT INTO event_participants (event_id, user_id)
SELECT id, created_by FROM events WHERE created_by IS NOT NULL
ON CONFLICT DO NOTHING;
