-- Escrow metadata for commission payments (PSP integration for real holds)
ALTER TABLE commissions ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE commissions ADD COLUMN IF NOT EXISTS escrow_status TEXT NOT NULL DEFAULT 'none';
ALTER TABLE commissions ADD COLUMN IF NOT EXISTS escrow_funded_at TIMESTAMPTZ;
ALTER TABLE commissions ADD COLUMN IF NOT EXISTS escrow_released_at TIMESTAMPTZ;

ALTER TABLE commissions DROP CONSTRAINT IF EXISTS commissions_escrow_status_check;
ALTER TABLE commissions
  ADD CONSTRAINT commissions_escrow_status_check
  CHECK (escrow_status IN ('none', 'funded', 'released', 'refunded'));

COMMENT ON COLUMN commissions.payment_method IS 'Payment rail when patron funded escrow';
COMMENT ON COLUMN commissions.escrow_status IS 'Escrow lifecycle: none funded released refunded';
