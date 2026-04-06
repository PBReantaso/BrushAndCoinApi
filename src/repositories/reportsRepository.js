const { isPostgresEnabled, query } = require('../config/database');
const { memoryStore } = require('../data/memoryStore');

function _reporterLabelFromMemoryUser(u) {
  if (!u) return 'Unknown';
  const name = u.username && String(u.username).trim() !== '' ? u.username : String(u.email || 'user').split('@')[0];
  return name;
}

function _mapMemoryReport(r) {
  const status = r.status || 'pending';
  const u = memoryStore.users.find((x) => Number(x.id) === Number(r.reporterId));
  return {
    id: r.id,
    reporterId: r.reporterId,
    reporterLabel: _reporterLabelFromMemoryUser(u),
    targetKind: r.targetKind,
    targetId: r.targetId,
    reason: r.reason ?? null,
    createdAt: r.createdAt,
    status,
    resolvedAt: r.resolvedAt ?? null,
    resolutionNote: r.resolutionNote ?? null,
  };
}

/**
 * @param {{ reporterId: number, targetKind: 'post' | 'user', targetId: number, reason: string | null }} row
 * @returns {Promise<{ alreadyReported: boolean }>}
 */
async function addReport(row) {
  const rid = Number(row.reporterId);
  const tid = Number(row.targetId);
  const kind = row.targetKind;
  const reason = row.reason == null || String(row.reason).trim() === '' ? null : String(row.reason).trim().slice(0, 2000);

  if (!Number.isFinite(rid) || rid <= 0 || !Number.isFinite(tid) || tid <= 0) {
    return { alreadyReported: false };
  }
  if (kind !== 'post' && kind !== 'user') {
    return { alreadyReported: false };
  }

  if (!isPostgresEnabled()) {
    const dup = memoryStore.reports.some(
      (r) =>
        Number(r.reporterId) === rid &&
        r.targetKind === kind &&
        Number(r.targetId) === tid,
    );
    if (dup) {
      return { alreadyReported: true };
    }
    const nextId = (memoryStore.reports.at(-1)?.id ?? 0) + 1;
    memoryStore.reports.push({
      id: nextId,
      reporterId: rid,
      targetKind: kind,
      targetId: tid,
      reason,
      createdAt: new Date().toISOString(),
      status: 'pending',
      resolvedAt: null,
      resolutionNote: null,
    });
    return { alreadyReported: false };
  }

  const result = await query(
    `INSERT INTO reports (reporter_id, target_kind, target_id, reason)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (reporter_id, target_kind, target_id) DO NOTHING
     RETURNING id`,
    [rid, kind, tid, reason],
  );
  return { alreadyReported: result.rows.length === 0 };
}

/**
 * @param {{ status?: string }} filters — status: 'all' | 'pending' | 'resolved' | 'dismissed'
 */
async function listReportsForAdmin(filters = {}) {
  const st = filters.status || 'all';

  if (!isPostgresEnabled()) {
    let rows = memoryStore.reports.map((r) => _mapMemoryReport(r));
    if (st !== 'all') {
      rows = rows.filter((r) => r.status === st);
    }
    rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return rows.slice(0, 200);
  }

  const params = [];
  let where = '1=1';
  if (st !== 'all') {
    params.push(st);
    where += ` AND r.status = $${params.length}`;
  }

  const result = await query(
    `SELECT
       r.id,
       r.reporter_id AS "reporterId",
       COALESCE(NULLIF(TRIM(u.username), ''), split_part(u.email, '@', 1)) AS "reporterLabel",
       r.target_kind AS "targetKind",
       r.target_id AS "targetId",
       r.reason,
       r.created_at AS "createdAt",
       r.status,
       r.resolved_at AS "resolvedAt",
       r.resolution_note AS "resolutionNote"
     FROM reports r
     JOIN users u ON u.id = r.reporter_id
     WHERE ${where}
     ORDER BY r.created_at DESC
     LIMIT 200`,
    params,
  );
  return result.rows;
}

/**
 * @param {number} id
 * @returns {Promise<object|null>}
 */
async function getReportById(id) {
  const pid = Number(id);
  if (!Number.isFinite(pid) || pid <= 0) return null;

  if (!isPostgresEnabled()) {
    const r = memoryStore.reports.find((x) => Number(x.id) === pid);
    return r ? _mapMemoryReport(r) : null;
  }

  const result = await query(
    `SELECT
       r.id,
       r.reporter_id AS "reporterId",
       COALESCE(NULLIF(TRIM(u.username), ''), split_part(u.email, '@', 1)) AS "reporterLabel",
       r.target_kind AS "targetKind",
       r.target_id AS "targetId",
       r.reason,
       r.created_at AS "createdAt",
       r.status,
       r.resolved_at AS "resolvedAt",
       r.resolution_note AS "resolutionNote"
     FROM reports r
     JOIN users u ON u.id = r.reporter_id
     WHERE r.id = $1
     LIMIT 1`,
    [pid],
  );
  return result.rows[0] || null;
}

/**
 * @param {number} id
 * @param {{ status: string, resolutionNote: string | null }} payload
 */
async function resolveReportById(id, payload) {
  const pid = Number(id);
  const status = payload.status;
  const resolutionNote = payload.resolutionNote;

  if (!isPostgresEnabled()) {
    const r = memoryStore.reports.find((x) => Number(x.id) === pid);
    if (!r) return null;
    r.status = status;
    r.resolvedAt = new Date().toISOString();
    r.resolutionNote = resolutionNote;
    return _mapMemoryReport(r);
  }

  const upd = await query(
    `UPDATE reports
     SET status = $1,
         resolved_at = NOW(),
         resolution_note = $2
     WHERE id = $3
     RETURNING id`,
    [status, resolutionNote, pid],
  );
  if (upd.rowCount === 0) return null;

  const result = await query(
    `SELECT
       r.id,
       r.reporter_id AS "reporterId",
       COALESCE(NULLIF(TRIM(u.username), ''), split_part(u.email, '@', 1)) AS "reporterLabel",
       r.target_kind AS "targetKind",
       r.target_id AS "targetId",
       r.reason,
       r.created_at AS "createdAt",
       r.status,
       r.resolved_at AS "resolvedAt",
       r.resolution_note AS "resolutionNote"
     FROM reports r
     JOIN users u ON u.id = r.reporter_id
     WHERE r.id = $1
     LIMIT 1`,
    [pid],
  );
  return result.rows[0] || null;
}

module.exports = {
  addReport,
  listReportsForAdmin,
  getReportById,
  resolveReportById,
};
