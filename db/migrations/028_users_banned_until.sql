-- Temporary account suspensions (moderation)

ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_until TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_users_banned_until_active
  ON users(banned_until)
  WHERE banned_until IS NOT NULL;
