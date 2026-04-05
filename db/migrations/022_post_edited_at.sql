-- Tracks when a post's text was last edited (title/description).
ALTER TABLE posts ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
