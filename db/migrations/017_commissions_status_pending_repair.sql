-- Repair DBs that still have the old status check (inquiry only, no pending).
-- New commissions INSERT uses status 'pending' (see commissionsRepository).
ALTER TABLE commissions DROP CONSTRAINT IF EXISTS commissions_status_check;
UPDATE commissions SET status = 'pending' WHERE status = 'inquiry';
ALTER TABLE commissions
  ADD CONSTRAINT commissions_status_check
  CHECK (status IN ('pending', 'accepted', 'inProgress', 'completed', 'rejected'));
ALTER TABLE commissions ALTER COLUMN status SET DEFAULT 'pending';
