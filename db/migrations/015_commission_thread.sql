-- Commission-scoped chat: one conversation per commission.
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS commission_id INTEGER REFERENCES commissions(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_one_per_commission ON conversations(commission_id) WHERE commission_id IS NOT NULL;

-- Thread preview + sorting on commission list
ALTER TABLE commissions ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ;
ALTER TABLE commissions ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Per-role unread on commission list (replaces single flag semantics for viewers)
ALTER TABLE commissions ADD COLUMN IF NOT EXISTS unread_for_artist BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE commissions ADD COLUMN IF NOT EXISTS unread_for_patron BOOLEAN NOT NULL DEFAULT FALSE;
