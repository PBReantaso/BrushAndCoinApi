const { isPostgresEnabled, query } = require('../config/database');
const { memoryStore } = require('../data/memoryStore');

function mapRow(row) {
  if (!row) return null;
  const ref =
    row.reference_images != null
      ? row.reference_images
      : row.referenceImages != null
        ? row.referenceImages
        : [];
  const images = Array.isArray(ref) ? ref : typeof ref === 'string' ? JSON.parse(ref || '[]') : [];

  return {
    id: row.id,
    patronId: row.patron_id ?? row.patronId,
    artistId: row.artist_id ?? row.artistId,
    title: row.title,
    clientName: row.client_name ?? row.clientName,
    description: row.description ?? '',
    lastMessage: row.last_message ?? row.lastMessage,
    hasUnreadMessages: Boolean(row.hasUnreadMessages || row.unreadMessages || row.hasNewMessages),
    budget: Number(row.budget ?? 0),
    deadline: row.deadline ?? null,
    specialRequirements: row.special_requirements ?? row.specialRequirements ?? '',
    isUrgent: Boolean(row.is_urgent ?? row.isUrgent),
    referenceImages: images,
    totalAmount: Number(row.total_amount ?? row.totalAmount ?? 0),
    status: row.status,
    milestones: Array.isArray(row.milestones) ? row.milestones : [],
    createdAt: row.created_at ?? row.createdAt,
  };
}

function toApiCommission(m) {
  return {
    id: m.id,
    title: m.title,
    clientName: m.clientName,
    status: m.status,
    milestones: Array.isArray(m.milestones) ? m.milestones : [],
    description: m.description,
    lastMessage: m.lastMessage ?? null,
    hasUnreadMessages: Boolean(m.hasUnreadMessages),
    budget: m.budget,
    deadline: m.deadline,
    specialRequirements: m.specialRequirements,
    isUrgent: m.isUrgent,
    referenceImages: m.referenceImages,
    totalAmount: m.totalAmount,
  };
}

async function listCommissionsForUser(userId) {
  const uid = Number(userId);
  if (!Number.isFinite(uid) || uid <= 0) return [];

  if (!isPostgresEnabled()) {
    return memoryStore.commissions
      .filter((c) => Number(c.patronId) === uid || Number(c.artistId) === uid)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map(toApiCommission);
  }

  const result = await query(
    `SELECT
      id,
      patron_id AS "patronId",
      artist_id AS "artistId",
      title,
      client_name AS "clientName",
      description,
      last_message AS "lastMessage",
      has_unread_messages AS "hasUnreadMessages",
      budget,
      deadline,
      special_requirements AS "specialRequirements",
      is_urgent AS "isUrgent",
      reference_images AS "referenceImages",
      total_amount AS "totalAmount",
      status,
      created_at AS "createdAt"
    FROM commissions
    WHERE patron_id = $1 OR artist_id = $1
    ORDER BY created_at DESC, id DESC`,
    [uid],
  );
  return result.rows.map((r) => toApiCommission(mapRow(r)));
}

async function findCommissionById(id) {
  const cid = Number(id);
  if (!Number.isFinite(cid) || cid <= 0) return null;

  if (!isPostgresEnabled()) {
    const m = memoryStore.commissions.find((c) => Number(c.id) === cid);
    return m ? { ...m } : null;
  }

  const result = await query(
    `SELECT
      id,
      patron_id AS "patronId",
      artist_id AS "artistId",
      title,
      client_name AS "clientName",
      description,
      last_message AS "lastMessage",
      has_unread_messages AS "hasUnreadMessages",
      budget,
      deadline,
      special_requirements AS "specialRequirements",
      is_urgent AS "isUrgent",
      reference_images AS "referenceImages",
      total_amount AS "totalAmount",
      status,
      created_at AS "createdAt"
    FROM commissions WHERE id = $1 LIMIT 1`,
    [cid],
  );
  return mapRow(result.rows[0]) || null;
}

async function createCommission(data) {
  const patronId = Number(data.patronId);
  const artistId = Number(data.artistId);
  if (!Number.isFinite(patronId) || patronId <= 0 || !Number.isFinite(artistId) || artistId <= 0) {
    return null;
  }

  const title = String(data.title ?? '').trim();
  if (!title) return null;

  const row = {
    patronId,
    artistId,
    title,
    clientName: String(data.clientName ?? '').trim() || 'Client',
    description: String(data.description ?? ''),
    budget: Number(data.budget ?? 0),
    deadline: data.deadline == null || data.deadline === '' ? null : String(data.deadline),
    specialRequirements: String(data.specialRequirements ?? ''),
    isUrgent: Boolean(data.isUrgent),
    referenceImages: Array.isArray(data.referenceImages) ? data.referenceImages.map(String) : [],
    totalAmount: Number(data.totalAmount ?? 0),
    status: 'inquiry',
  };

  if (!isPostgresEnabled()) {
    const nextId = (memoryStore.commissions.at(-1)?.id ?? 0) + 1;
    const m = {
      ...row,
      id: nextId,
      createdAt: new Date().toISOString(),
    };
    memoryStore.commissions.push(m);
    return m;
  }

  const result = await query(
    `INSERT INTO commissions (
      patron_id, artist_id, title, client_name, description, budget, deadline,
      special_requirements, is_urgent, reference_images, total_amount, status
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,'inquiry')
    RETURNING
      id,
      patron_id AS "patronId",
      artist_id AS "artistId",
      title,
      client_name AS "clientName",
      description,
      budget,
      deadline,
      special_requirements AS "specialRequirements",
      is_urgent AS "isUrgent",
      reference_images AS "referenceImages",
      total_amount AS "totalAmount",
      status,
      created_at AS "createdAt"`,
    [
      patronId,
      artistId,
      row.title,
      row.clientName,
      row.description,
      row.budget,
      row.deadline,
      row.specialRequirements,
      row.isUrgent,
      JSON.stringify(row.referenceImages),
      row.totalAmount,
    ],
  );
  return mapRow(result.rows[0]);
}

const ALLOWED = {
  inquiry: ['accepted', 'rejected'],
  accepted: ['inProgress', 'rejected'],
  inProgress: ['completed', 'rejected'],
  completed: [],
  rejected: [],
};

async function updateCommissionStatus(commissionId, newStatus, actingUserId) {
  const cid = Number(commissionId);
  const uid = Number(actingUserId);
  const status = String(newStatus ?? '').trim();
  if (!Number.isFinite(cid) || cid <= 0 || !Number.isFinite(uid) || uid <= 0) {
    return { ok: false, reason: 'invalid' };
  }

  const validTargets = new Set(['accepted', 'rejected', 'inProgress', 'completed', 'inquiry']);
  if (!validTargets.has(status)) {
    return { ok: false, reason: 'invalid_status' };
  }

  const existing = await findCommissionById(cid);
  if (!existing) {
    return { ok: false, reason: 'not_found' };
  }
  if (Number(existing.artistId) !== uid) {
    return { ok: false, reason: 'forbidden' };
  }

  const current = String(existing.status);
  const nextAllowed = ALLOWED[current] || [];
  if (!nextAllowed.includes(status)) {
    return { ok: false, reason: 'invalid_transition' };
  }

  if (!isPostgresEnabled()) {
    const m = memoryStore.commissions.find((c) => Number(c.id) === cid);
    if (m) m.status = status;
    return { ok: true, commission: { ...m } };
  }

  const result = await query(
    `UPDATE commissions SET status = $2 WHERE id = $1 AND artist_id = $3
    RETURNING
      id,
      patron_id AS "patronId",
      artist_id AS "artistId",
      title,
      client_name AS "clientName",
      description,
      last_message AS "lastMessage",
      has_unread_messages AS "hasUnreadMessages",
      budget,
      deadline,
      special_requirements AS "specialRequirements",
      is_urgent AS "isUrgent",
      reference_images AS "referenceImages",
      total_amount AS "totalAmount",
      status,
      created_at AS "createdAt"`,
    [cid, status, uid],
  );
  return { ok: true, commission: mapRow(result.rows[0]) };
}

module.exports = {
  listCommissionsForUser,
  findCommissionById,
  createCommission,
  updateCommissionStatus,
  toApiCommission,
};
