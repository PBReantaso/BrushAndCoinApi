-- Social profile links (JSON) and tips / billing preferences.
ALTER TABLE users ADD COLUMN IF NOT EXISTS social_links JSONB NOT NULL DEFAULT '{"facebook":"","instagram":"","twitter":"","website":""}'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS tips_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS tips_url TEXT;
