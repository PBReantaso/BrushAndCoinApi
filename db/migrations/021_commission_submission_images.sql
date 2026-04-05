-- Delivered artwork for review (URLs served under /uploads/commissions/:id/...)
ALTER TABLE commissions
  ADD COLUMN IF NOT EXISTS submission_images JSONB NOT NULL DEFAULT '[]'::jsonb;
