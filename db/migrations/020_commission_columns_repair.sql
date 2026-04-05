-- Idempotent repair if an older migration file failed partway
ALTER TABLE commissions ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE commissions ADD COLUMN IF NOT EXISTS escrow_status TEXT NOT NULL DEFAULT 'none';
ALTER TABLE commissions ADD COLUMN IF NOT EXISTS escrow_funded_at TIMESTAMPTZ;
ALTER TABLE commissions ADD COLUMN IF NOT EXISTS escrow_released_at TIMESTAMPTZ;
ALTER TABLE commissions ADD COLUMN IF NOT EXISTS preferred_payment_method TEXT;
