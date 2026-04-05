-- Patron preferred rail when submitting the commission request
ALTER TABLE commissions ADD COLUMN IF NOT EXISTS preferred_payment_method TEXT;

COMMENT ON COLUMN commissions.preferred_payment_method IS 'Patron preference at request: gcash paymaya paypal stripe';
