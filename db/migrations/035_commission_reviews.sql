ALTER TABLE commissions
  ADD COLUMN IF NOT EXISTS review_rating INTEGER;

ALTER TABLE commissions
  ADD COLUMN IF NOT EXISTS review_comment TEXT;

ALTER TABLE commissions
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

ALTER TABLE commissions
  ADD COLUMN IF NOT EXISTS reviewed_by_patron_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE commissions
  DROP CONSTRAINT IF EXISTS commissions_review_rating_check;

ALTER TABLE commissions
  ADD CONSTRAINT commissions_review_rating_check
  CHECK (review_rating IS NULL OR (review_rating >= 1 AND review_rating <= 5));
