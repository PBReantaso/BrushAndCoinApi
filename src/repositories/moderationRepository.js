const { isPostgresEnabled, query } = require('../config/database');
const { memoryStore } = require('../data/memoryStore');

function _mapAction(row) {
  return {
    id: row.id,
    targetUserId: row.target_user_id ?? row.targetUserId,
    adminUserId: row.admin_user_id ?? row.adminUserId ?? null,
    reportId: row.report_id ?? row.reportId ?? null,
    actionType: row.action_type ?? row.actionType,
    reason: row.reason ?? null,
    details: row.details && typeof row.details === 'object' ? row.details : {},
    createdAt: row.created_at ?? row.createdAt,
  };
}

function _mapAppeal(row) {
  return {
    id: row.id,
    userId: row.user_id ?? row.userId,
    moderationActionId: row.moderation_action_id ?? row.moderationActionId ?? null,
    message: row.message ?? '',
    status: row.status ?? 'open',
    adminNote: row.admin_note ?? row.adminNote ?? null,
    resolvedByAdminId: row.resolved_by_admin_id ?? row.resolvedByAdminId ?? null,
    resolvedAt: row.resolved_at ?? row.resolvedAt ?? null,
    createdAt: row.created_at ?? row.createdAt,
  };
}

async function insertModerationAction({
  targetUserId,
  adminUserId = null,
  reportId = null,
  actionType,
  reason = null,
  details = {},
}) {
  const tid = Number(targetUserId);
  if (!Number.isFinite(tid) || tid <= 0) return null;
  const aid = adminUserId == null ? null : Number(adminUserId);
  const rid = reportId == null ? null : Number(reportId);
  const type = String(actionType ?? '').trim();
  if (!type) return null;
  const msg = reason == null ? null : String(reason).trim().slice(0, 2000);
  const det = details && typeof details === 'object' ? details : {};

  if (!isPostgresEnabled()) {
    const nextId = (memoryStore.moderationActions.at(-1)?.id ?? 0) + 1;
    const row = {
      id: nextId,
      targetUserId: tid,
      adminUserId: Number.isFinite(aid) && aid > 0 ? aid : null,
      reportId: Number.isFinite(rid) && rid > 0 ? rid : null,
      actionType: type,
      reason: msg,
      details: { ...det },
      createdAt: new Date().toISOString(),
    };
    memoryStore.moderationActions.push(row);
    return row;
  }

  const result = await query(
    `INSERT INTO moderation_actions (
       target_user_id, admin_user_id, report_id, action_type, reason, details
     ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     RETURNING
       id,
       target_user_id AS "targetUserId",
       admin_user_id AS "adminUserId",
       report_id AS "reportId",
       action_type AS "actionType",
       reason,
       details,
       created_at AS "createdAt"`,
    [tid, Number.isFinite(aid) && aid > 0 ? aid : null, Number.isFinite(rid) && rid > 0 ? rid : null, type, msg, det],
  );
  return result.rows[0] || null;
}

async function listModerationActionsForUser(userId, limit = 50) {
  const uid = Number(userId);
  const lim = Math.max(1, Math.min(200, Number(limit) || 50));
  if (!Number.isFinite(uid) || uid <= 0) return [];

  if (!isPostgresEnabled()) {
    return memoryStore.moderationActions
      .filter((a) => Number(a.targetUserId) === uid)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, lim)
      .map(_mapAction);
  }

  const result = await query(
    `SELECT
       id,
       target_user_id AS "targetUserId",
       admin_user_id AS "adminUserId",
       report_id AS "reportId",
       action_type AS "actionType",
       reason,
       details,
       created_at AS "createdAt"
     FROM moderation_actions
     WHERE target_user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [uid, lim],
  );
  return result.rows;
}

async function listModerationActionsForAdmin(limit = 100) {
  const lim = Math.max(1, Math.min(500, Number(limit) || 100));
  if (!isPostgresEnabled()) {
    return [...memoryStore.moderationActions]
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, lim)
      .map(_mapAction);
  }
  const result = await query(
    `SELECT
       id,
       target_user_id AS "targetUserId",
       admin_user_id AS "adminUserId",
       report_id AS "reportId",
       action_type AS "actionType",
       reason,
       details,
       created_at AS "createdAt"
     FROM moderation_actions
     ORDER BY created_at DESC
     LIMIT $1`,
    [lim],
  );
  return result.rows;
}

async function createAppeal({ userId, moderationActionId = null, message }) {
  const uid = Number(userId);
  const mid = moderationActionId == null ? null : Number(moderationActionId);
  const msg = String(message ?? '').trim().slice(0, 3000);
  if (!Number.isFinite(uid) || uid <= 0 || !msg) return null;

  if (!isPostgresEnabled()) {
    const nextId = (memoryStore.moderationAppeals.at(-1)?.id ?? 0) + 1;
    const row = {
      id: nextId,
      userId: uid,
      moderationActionId: Number.isFinite(mid) && mid > 0 ? mid : null,
      message: msg,
      status: 'open',
      adminNote: null,
      resolvedByAdminId: null,
      resolvedAt: null,
      createdAt: new Date().toISOString(),
    };
    memoryStore.moderationAppeals.push(row);
    return row;
  }

  const result = await query(
    `INSERT INTO moderation_appeals (user_id, moderation_action_id, message)
     VALUES ($1, $2, $3)
     RETURNING
       id,
       user_id AS "userId",
       moderation_action_id AS "moderationActionId",
       message,
       status,
       admin_note AS "adminNote",
       resolved_by_admin_id AS "resolvedByAdminId",
       resolved_at AS "resolvedAt",
       created_at AS "createdAt"`,
    [uid, Number.isFinite(mid) && mid > 0 ? mid : null, msg],
  );
  return result.rows[0] || null;
}

async function listAppealsForUser(userId, limit = 50) {
  const uid = Number(userId);
  const lim = Math.max(1, Math.min(200, Number(limit) || 50));
  if (!Number.isFinite(uid) || uid <= 0) return [];

  if (!isPostgresEnabled()) {
    return memoryStore.moderationAppeals
      .filter((a) => Number(a.userId) === uid)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, lim)
      .map(_mapAppeal);
  }

  const result = await query(
    `SELECT
       id,
       user_id AS "userId",
       moderation_action_id AS "moderationActionId",
       message,
       status,
       admin_note AS "adminNote",
       resolved_by_admin_id AS "resolvedByAdminId",
       resolved_at AS "resolvedAt",
       created_at AS "createdAt"
     FROM moderation_appeals
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [uid, lim],
  );
  return result.rows;
}

async function listAppealsForAdmin({ status = 'all', limit = 100 } = {}) {
  const st = String(status || 'all').trim().toLowerCase();
  const lim = Math.max(1, Math.min(500, Number(limit) || 100));
  if (!isPostgresEnabled()) {
    let rows = [...memoryStore.moderationAppeals];
    if (st !== 'all') rows = rows.filter((x) => String(x.status) === st);
    return rows
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, lim)
      .map(_mapAppeal);
  }

  const params = [];
  let where = '1=1';
  if (st !== 'all') {
    params.push(st);
    where += ` AND status = $${params.length}`;
  }
  params.push(lim);
  const result = await query(
    `SELECT
       id,
       user_id AS "userId",
       moderation_action_id AS "moderationActionId",
       message,
       status,
       admin_note AS "adminNote",
       resolved_by_admin_id AS "resolvedByAdminId",
       resolved_at AS "resolvedAt",
       created_at AS "createdAt"
     FROM moderation_appeals
     WHERE ${where}
     ORDER BY created_at DESC
     LIMIT $${params.length}`,
    params,
  );
  return result.rows;
}

async function resolveAppeal(appealId, { status, adminNote, adminUserId }) {
  const id = Number(appealId);
  const aid = Number(adminUserId);
  const st = String(status ?? '').trim().toLowerCase();
  if (!Number.isFinite(id) || id <= 0 || !Number.isFinite(aid) || aid <= 0) return null;
  if (st !== 'approved' && st !== 'rejected') return null;
  const note = adminNote == null ? null : String(adminNote).trim().slice(0, 2000);

  if (!isPostgresEnabled()) {
    const row = memoryStore.moderationAppeals.find((a) => Number(a.id) === id);
    if (!row || String(row.status) !== 'open') return null;
    row.status = st;
    row.adminNote = note;
    row.resolvedByAdminId = aid;
    row.resolvedAt = new Date().toISOString();
    return _mapAppeal(row);
  }

  const result = await query(
    `UPDATE moderation_appeals
     SET status = $2,
         admin_note = $3,
         resolved_by_admin_id = $4,
         resolved_at = NOW()
     WHERE id = $1
       AND status = 'open'
     RETURNING
       id,
       user_id AS "userId",
       moderation_action_id AS "moderationActionId",
       message,
       status,
       admin_note AS "adminNote",
       resolved_by_admin_id AS "resolvedByAdminId",
       resolved_at AS "resolvedAt",
       created_at AS "createdAt"`,
    [id, st, note, aid],
  );
  return result.rows[0] || null;
}

module.exports = {
  insertModerationAction,
  listModerationActionsForUser,
  listModerationActionsForAdmin,
  createAppeal,
  listAppealsForUser,
  listAppealsForAdmin,
  resolveAppeal,
};

