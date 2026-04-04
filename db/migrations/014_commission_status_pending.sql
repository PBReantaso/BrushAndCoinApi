-- Initial commission state is "pending" (was "inquiry").
ALTER TABLE commissions DROP CONSTRAINT IF EXISTS commissions_status_check;
UPDATE commissions SET status = 'pending' WHERE status = 'inquiry';
ALTER TABLE commissions
  ADD CONSTRAINT commissions_status_check
  CHECK (status IN ('pending', 'accepted', 'inProgress', 'completed', 'rejected'));
ALTER TABLE commissions ALTER COLUMN status SET DEFAULT 'pending';
