CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Art',
  event_date DATE NOT NULL,
  event_time TIME NOT NULL,
  venue TEXT NOT NULL DEFAULT '',
  location_text TEXT NOT NULL DEFAULT '',
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),
  description TEXT NOT NULL DEFAULT '',
  additional_info TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  schedules JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

