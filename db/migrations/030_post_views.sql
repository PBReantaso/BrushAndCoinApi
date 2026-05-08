-- Post view analytics (artist-facing performance)

CREATE TABLE IF NOT EXISTS post_views (
  id SERIAL PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  post_owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_post_views_owner_created
  ON post_views(post_owner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_post_views_post_created
  ON post_views(post_id, created_at DESC);

