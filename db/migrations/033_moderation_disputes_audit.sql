-- Moderation audit log + user appeals (dispute center).

CREATE TABLE IF NOT EXISTS moderation_actions (
  id SERIAL PRIMARY KEY,
  target_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  admin_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  report_id INTEGER REFERENCES reports(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  reason TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (action_type IN ('warning', 'temp_ban', 'permanent_ban', 'post_deleted'))
);

CREATE INDEX IF NOT EXISTS idx_moderation_actions_target_created
  ON moderation_actions(target_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_moderation_actions_report
  ON moderation_actions(report_id);

CREATE TABLE IF NOT EXISTS moderation_appeals (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  moderation_action_id INTEGER REFERENCES moderation_actions(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  admin_note TEXT,
  resolved_by_admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (status IN ('open', 'approved', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_moderation_appeals_user_created
  ON moderation_appeals(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_moderation_appeals_status_created
  ON moderation_appeals(status, created_at DESC);

