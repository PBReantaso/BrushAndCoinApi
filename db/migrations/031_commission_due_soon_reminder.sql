-- Reminder timestamp to avoid spamming "due soon" notifications.

ALTER TABLE commissions
ADD COLUMN IF NOT EXISTS due_soon_notified_at TIMESTAMPTZ;

