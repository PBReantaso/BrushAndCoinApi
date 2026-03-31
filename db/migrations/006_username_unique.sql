-- Enforce unique usernames case-insensitively (trimmed, non-empty only).
-- If this fails, resolve duplicate LOWER(TRIM(username)) values in the DB first.
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_unique
ON users (LOWER(TRIM(username)))
WHERE TRIM(COALESCE(username, '')) <> '';
