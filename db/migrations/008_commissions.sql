CREATE TABLE IF NOT EXISTS commissions (
  id SERIAL PRIMARY KEY,
  patron_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  artist_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  client_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  budget NUMERIC(12,2) NOT NULL DEFAULT 0,
  deadline TEXT,
  special_requirements TEXT NOT NULL DEFAULT '',
  is_urgent BOOLEAN NOT NULL DEFAULT FALSE,
  reference_images JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'inquiry'
    CHECK (status IN ('inquiry', 'accepted', 'inProgress', 'completed', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commissions_patron ON commissions(patron_id);
CREATE INDEX IF NOT EXISTS idx_commissions_artist ON commissions(artist_id);
