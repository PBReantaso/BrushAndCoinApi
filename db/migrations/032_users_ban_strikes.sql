-- Progressive enforcement for repeat offenders.
-- If a user is banned more than 3 times, they become permanently banned.

ALTER TABLE users
ADD COLUMN IF NOT EXISTS ban_strike_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS permanently_banned_at TIMESTAMPTZ;

