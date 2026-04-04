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

  const hasExplicitUnread = Object.prototype.hasOwnProperty.call(row, 'hasUnreadMessages');
  const unreadLegacy = Boolean(row.unreadMessages || row.hasNewMessages || row.has_unread_messages);

  return {
    id: row.id,
    patronId: row.patron_id ?? row.patronId,
    artistId: row.artist_id ?? row.artistId,
    title: row.title,
    clientName: row.client_name ?? row.clientName,
    description: row.description ?? '',
    lastMessage: row.last_message ?? row.lastMessage,
    hasUnreadMessages: hasExplicitUnread ? Boolean(row.hasUnreadMessages) : unreadLegacy,
    unreadForArtist: Boolean(row.unread_for_artist ?? row.unreadForArtist),
    unreadForPatron: Boolean(row.unread_for_patron ?? row.unreadForPatron),
    budget: Number(row.budget ?? 0),
    deadline: row.deadline ?? null,
    specialRequirements: row.special_requirements ?? row.specialRequirements ?? '',
    isUrgent: Boolean(row.is_urgent ?? row.isUrgent),
    referenceImages: images,
    totalAmount: Number(row.total_amount ?? row.totalAmount ?? 0),
    status: row.status,
    milestones: Array.isArray(row.milestones) ? row.milestones : [],
    createdAt: row.created_at ?? row.createdAt,
    lastMessageAt: row.last_message_at ?? row.lastMessageAt ?? null,
    completedAt: row.completed_at ?? row.completedAt ?? null,
  };
}

function toIso(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

function toApiCommission(m) {
  return {
    id: m.id,
    patronId: m.patronId,
    artistId: m.artistId,
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
    createdAt: toIso(m.createdAt),
    lastMessageAt: toIso(m.lastMessageAt),
    completedAt: toIso(m.completedAt),
  };
}

async function listCommissionsForUser(userId) {
  const uid = Number(userId);
  if (!Number.isFinite(uid) || uid <= 0) return [];

  if (!isPostgresEnabled()) {
    return memoryStore.commissions
      .filter((c) => Number(c.patronId) === uid || Number(c.artistId) === uid)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((c) => {
        const row = {
          ...c,
          hasUnreadMessages:
            Number(c.artistId) === uid ? Boolean(c.unreadForArtist) : Boolean(c.unreadForPatron),
        };
        return toApiCommission(mapRow(row));
      });
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
      CASE
        WHEN artist_id = $1 THEN unread_for_artist
        ELSE unread_for_patron
      END AS "hasUnreadMessages",
      budget,
      deadline,
      special_requirements AS "specialRequirements",
      is_urgent AS "isUrgent",
      reference_images AS "referenceImages",
      total_amount AS "totalAmount",
      status,
      created_at AS "createdAt",
      last_message_at AS "lastMessageAt",
      completed_at AS "completedAt",
      unread_for_artist AS "unreadForArtist",
      unread_for_patron AS "unreadForPatron"
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
      budget,
      deadline,
      special_requirements AS "specialRequirements",
      is_urgent AS "isUrgent",
      reference_images AS "referenceImages",
      total_amount AS "totalAmount",
      status,
      created_at AS "createdAt",
      last_message_at AS "lastMessageAt",
      completed_at AS "completedAt",
      unread_for_artist AS "unreadForArtist",
      unread_for_patron AS "unreadForPatron"
    FROM commissions WHERE id = $1 LIMIT 1`,
    [cid],
  );
  return mapRow(result.rows[0]) || null;
}

async function findCommissionByIdForUser(commissionId, userId) {
  const c = await findCommissionById(commissionId);
  const uid = Number(userId);
  if (!c || !Number.isFinite(uid) || uid <= 0) return null;
  if (Number(c.artistId) !== uid && Number(c.patronId) !== uid) return null;
  const hasUnread = Number(c.artistId) === uid ? c.unreadForArtist : c.unreadForPatron;
  return { ...c, hasUnreadMessages: Boolean(hasUnread) };
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
    status: 'pending',
  };

  if (!isPostgresEnabled()) {
    const nextId = (memoryStore.commissions.at(-1)?.id ?? 0) + 1;
    const m = {
      ...row,
      id: nextId,
      createdAt: new Date().toISOString(),
      unreadForArtist: true,
      unreadForPatron: false,
      lastMessageAt: null,
      completedAt: null,
    };
    memoryStore.commissions.push(m);
    return m;
  }

  const result = await query(
    `INSERT INTO commissions (
      patron_id, artist_id, title, client_name, description, budget, deadline,
      special_requirements, is_urgent, reference_images, total_amount, status,
      unread_for_artist, unread_for_patron
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,'pending', TRUE, FALSE)
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
      created_at AS "createdAt",
      last_message_at AS "lastMessageAt",
      completed_at AS "completedAt",
      unread_for_artist AS "unreadForArtist",
      unread_for_patron AS "unreadForPatron"`,
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

const ALLOWED_ARTIST = {
  pending: ['accepted', 'rejected'],
  accepted: ['inProgress', 'rejected'],
  inProgress: ['rejected'],
  completed: [],
  rejected: [],
};

/** Patron: pay after accept; accept final delivery → completed. */
const ALLOWED_PATRON = {
  accepted: ['inProgress'],
  inProgress: ['completed'],
};

const RETURNING_COMMISSION = `RETURNING
      id,
      patron_id AS "patronId",
      artist_id AS "artistId",
      title,
      client_name AS "clientName",
      description,
      last_message AS "lastMessage",
      budget,
      deadline,
      special_requirements AS "specialRequirements",
      is_urgent AS "isUrgent",
      reference_images AS "referenceImages",
      total_amount AS "totalAmount",
      status,
      created_at AS "createdAt",
      last_message_at AS "lastMessageAt",
      completed_at AS "completedAt",
      unread_for_artist AS "unreadForArtist",
      unread_for_patron AS "unreadForPatron"`;

async function updateCommissionStatus(commissionId, newStatus, actingUserId) {
  const cid = Number(commissionId);
  const uid = Number(actingUserId);
  const status = String(newStatus ?? '').trim();
  if (!Number.isFinite(cid) || cid <= 0 || !Number.isFinite(uid) || uid <= 0) {
    return { ok: false, reason: 'invalid' };
  }

  const validTargets = new Set([
    'accepted',
    'rejected',
    'inProgress',
    'completed',
    'pending',
    'inquiry',
  ]);
  if (!validTargets.has(status)) {
    return { ok: false, reason: 'invalid_status' };
  }
  const nextStatus = status === 'inquiry' ? 'pending' : status;

  const existing = await findCommissionById(cid);
  if (!existing) {
    return { ok: false, reason: 'not_found' };
  }

  const isArtist = Number(existing.artistId) === uid;
  const isPatron = Number(existing.patronId) === uid;
  if (!isArtist && !isPatron) {
    return { ok: false, reason: 'forbidden' };
  }

  const currentNormalized =
    String(existing.status) === 'inquiry' ? 'pending' : String(existing.status);
  if (isPatron) {
    const nextPatron = ALLOWED_PATRON[currentNormalized] || [];
    if (!nextPatron.includes(nextStatus)) {
      return { ok: false, reason: 'invalid_transition' };
    }
  } else {
    const nextArtist = ALLOWED_ARTIST[currentNormalized] || [];
    if (!nextArtist.includes(nextStatus)) {
      return { ok: false, reason: 'invalid_transition' };
    }
  }

  if (!isPostgresEnabled()) {
    const m = memoryStore.commissions.find((c) => Number(c.id) === cid);
    if (!m) {
      return { ok: false, reason: 'not_found' };
    }
    if (isPatron && Number(m.patronId) !== uid) {
      return { ok: false, reason: 'forbidden' };
    }
    if (isArtist && Number(m.artistId) !== uid) {
      return { ok: false, reason: 'forbidden' };
    }
    m.status = nextStatus;
    if (nextStatus === 'completed') {
      m.completedAt = new Date().toISOString();
    }
    return { ok: true, commission: { ...m } };
  }

  const whereRole = isPatron ? 'patron_id' : 'artist_id';
  const completedFragment =
    nextStatus === 'completed' ? ', completed_at = CURRENT_TIMESTAMP' : '';
  const result = await query(
    `UPDATE commissions SET status = $2${completedFragment} WHERE id = $1 AND ${whereRole} = $3
    ${RETURNING_COMMISSION}`,
    [cid, nextStatus, uid],
  );
  if (!result.rows[0]) {
    return { ok: false, reason: 'forbidden' };
  }
  return { ok: true, commission: mapRow(result.rows[0]) };
}

async function applyCommissionThreadMessage(commissionId, snippet, senderId) {
  const cid = Number(commissionId);
  const sid = Number(senderId);
  const text = String(snippet ?? '').trim().slice(0, 500);
  if (!Number.isFinite(cid) || cid <= 0 || !Number.isFinite(sid) || sid <= 0) {
    return;
  }

  const row = await findCommissionById(cid);
  if (!row) return;
  const senderIsPatron = Number(row.patronId) === sid;

  if (!isPostgresEnabled()) {
    const m = memoryStore.commissions.find((c) => Number(c.id) === cid);
    if (m) {
      m.lastMessage = text;
      m.lastMessageAt = new Date().toISOString();
      m.unreadForArtist = !senderIsPatron;
      m.unreadForPatron = senderIsPatron;
    }
    return;
  }

  await query(
    `UPDATE commissions
     SET last_message = $2,
         last_message_at = CURRENT_TIMESTAMP,
         unread_for_artist = $3,
         unread_for_patron = $4
     WHERE id = $1`,
    [cid, text, senderIsPatron, !senderIsPatron],
  );
}

async function markCommissionThreadViewed(commissionId, viewerId) {
  const cid = Number(commissionId);
  const vid = Number(viewerId);
  if (!Number.isFinite(cid) || cid <= 0 || !Number.isFinite(vid) || vid <= 0) {
    return;
  }

  if (!isPostgresEnabled()) {
    const m = memoryStore.commissions.find((c) => Number(c.id) === cid);
    if (!m) return;
    if (Number(m.artistId) === vid) m.unreadForArtist = false;
    if (Number(m.patronId) === vid) m.unreadForPatron = false;
    return;
  }

  await query(
    `UPDATE commissions
     SET unread_for_artist = CASE WHEN artist_id = $2 THEN FALSE ELSE unread_for_artist END,
         unread_for_patron = CASE WHEN patron_id = $2 THEN FALSE ELSE unread_for_patron END
     WHERE id = $1`,
    [cid, vid],
  );
}

module.exports = {
  listCommissionsForUser,
  findCommissionById,
  findCommissionByIdForUser,
  createCommission,
  updateCommissionStatus,
  applyCommissionThreadMessage,
  markCommissionThreadViewed,
  toApiCommission,
};
