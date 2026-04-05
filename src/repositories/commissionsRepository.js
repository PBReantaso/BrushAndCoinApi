const { isPostgresEnabled, query } = require('../config/database');
const { memoryStore } = require('../data/memoryStore');

/** DB may still store `inquiry` (pre-migration); API always exposes `pending`. */
function normalizeDbCommissionStatus(status) {
  const s = String(status ?? '');
  return s === 'inquiry' ? 'pending' : s;
}

function mapRow(row) {
  if (!row) return null;
  const ref =
    row.reference_images != null
      ? row.reference_images
      : row.referenceImages != null
        ? row.referenceImages
        : [];
  const images = Array.isArray(ref) ? ref : typeof ref === 'string' ? JSON.parse(ref || '[]') : [];

  const rawSub =
    row.submission_images != null
      ? row.submission_images
      : row.submissionImages != null
        ? row.submissionImages
        : [];
  const subParsed = Array.isArray(rawSub)
    ? rawSub
    : typeof rawSub === 'string'
      ? JSON.parse(rawSub || '[]')
      : [];

  const hasExplicitUnread = Object.prototype.hasOwnProperty.call(row, 'hasUnreadMessages');
  const unreadLegacy = Boolean(row.unreadMessages || row.hasNewMessages || row.has_unread_messages);

  return {
    id: row.id,
    patronId: row.patron_id ?? row.patronId,
    artistId: row.artist_id ?? row.artistId,
    artistUsername: row.artist_username ?? row.artistUsername ?? null,
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
    submissionImages: subParsed.map((s) => String(s)),
    totalAmount: Number(row.total_amount ?? row.totalAmount ?? 0),
    status: normalizeDbCommissionStatus(row.status),
    milestones: Array.isArray(row.milestones) ? row.milestones : [],
    createdAt: row.created_at ?? row.createdAt,
    lastMessageAt: row.last_message_at ?? row.lastMessageAt ?? null,
    completedAt: row.completed_at ?? row.completedAt ?? null,
    submissionRound: Number(row.submission_round ?? row.submissionRound ?? 0),
    paymentMethod: row.payment_method ?? row.paymentMethod ?? null,
    escrowStatus: String(row.escrow_status ?? row.escrowStatus ?? 'none'),
    escrowFundedAt: row.escrow_funded_at ?? row.escrowFundedAt ?? null,
    escrowReleasedAt: row.escrow_released_at ?? row.escrowReleasedAt ?? null,
    preferredPaymentMethod: row.preferred_payment_method ?? row.preferredPaymentMethod ?? null,
  };
}

function toIso(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

/**
 * In-app simulated escrow: "funds" are tracked on the commission until completion/refund.
 * Replace with PSP webhooks + ledger when going to production.
 */
function buildEscrowSimulation(m) {
  const escrowStatus = String(m.escrowStatus ?? 'none');
  const total = Number(m.totalAmount ?? 0);
  const rounded = Math.round(total * 100) / 100;

  let phase = 'awaiting_funding';
  if (escrowStatus === 'funded') phase = 'held';
  else if (escrowStatus === 'released') phase = 'released_to_artist';
  else if (escrowStatus === 'refunded') phase = 'refunded_to_patron';

  const held = escrowStatus === 'funded' ? rounded : 0;
  const released = escrowStatus === 'released' ? rounded : 0;
  const refunded = escrowStatus === 'refunded' ? rounded : 0;

  return {
    mode: 'simulated',
    currency: 'PHP',
    phase,
    commissionTotal: rounded,
    heldInEscrow: held,
    releasedToArtist: released,
    refundedToPatron: refunded,
    releaseGoal:
      'Funds move from simulated escrow to the artist when the commission is marked completed.',
    refundNote: 'If the commission is rejected after funding, simulated escrow is marked refunded to the patron.',
    disclaimer:
      'Brush&Coin simulates holding and releasing funds in-app. No real money is stored until you connect a payment provider.',
  };
}

function toApiCommission(m) {
  const base = {
    id: m.id,
    patronId: m.patronId,
    artistId: m.artistId,
    artistUsername: m.artistUsername ?? null,
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
    submissionImages: Array.isArray(m.submissionImages) ? m.submissionImages : [],
    totalAmount: m.totalAmount,
    createdAt: toIso(m.createdAt),
    lastMessageAt: toIso(m.lastMessageAt),
    completedAt: toIso(m.completedAt),
    submissionRound: Number(m.submissionRound ?? 0),
    paymentMethod: m.paymentMethod ?? null,
    escrowStatus: m.escrowStatus ?? 'none',
    escrowFundedAt: toIso(m.escrowFundedAt),
    escrowReleasedAt: toIso(m.escrowReleasedAt),
    preferredPaymentMethod: m.preferredPaymentMethod ?? null,
  };
  return { ...base, escrowSimulation: buildEscrowSimulation(m) };
}

async function listCommissionsForUser(userId) {
  const uid = Number(userId);
  if (!Number.isFinite(uid) || uid <= 0) return [];

  if (!isPostgresEnabled()) {
    return memoryStore.commissions
      .filter((c) => Number(c.patronId) === uid || Number(c.artistId) === uid)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((c) => {
        const artist = memoryStore.users.find((u) => Number(u.id) === Number(c.artistId));
        const artistUsername = artist
          ? String(artist.username || '').trim() ||
            String(artist.email || '')
              .split('@')[0]
              .trim() ||
            null
          : null;
        const row = {
          ...c,
          artistUsername,
          hasUnreadMessages:
            Number(c.artistId) === uid ? Boolean(c.unreadForArtist) : Boolean(c.unreadForPatron),
        };
        return toApiCommission(mapRow(row));
      });
  }

  const result = await query(
    `SELECT
      c.id,
      c.patron_id AS "patronId",
      c.artist_id AS "artistId",
      COALESCE(NULLIF(TRIM(ua.username), ''), split_part(ua.email, '@', 1), 'Artist') AS "artistUsername",
      c.title,
      c.client_name AS "clientName",
      c.description,
      c.last_message AS "lastMessage",
      CASE
        WHEN c.artist_id = $1 THEN c.unread_for_artist
        ELSE c.unread_for_patron
      END AS "hasUnreadMessages",
      c.budget,
      c.deadline,
      c.special_requirements AS "specialRequirements",
      c.is_urgent AS "isUrgent",
      c.reference_images AS "referenceImages",
      c.total_amount AS "totalAmount",
      c.status,
      c.created_at AS "createdAt",
      c.last_message_at AS "lastMessageAt",
      c.completed_at AS "completedAt",
      c.unread_for_artist AS "unreadForArtist",
      c.unread_for_patron AS "unreadForPatron",
      c.submission_round AS "submissionRound",
      c.payment_method AS "paymentMethod",
      c.escrow_status AS "escrowStatus",
      c.escrow_funded_at AS "escrowFundedAt",
      c.escrow_released_at AS "escrowReleasedAt",
      c.preferred_payment_method AS "preferredPaymentMethod",
      c.submission_images AS "submissionImages"
    FROM commissions c
    INNER JOIN users ua ON ua.id = c.artist_id
    WHERE c.patron_id = $1 OR c.artist_id = $1
    ORDER BY c.created_at DESC, c.id DESC`,
    [uid],
  );
  return result.rows.map((r) => toApiCommission(mapRow(r)));
}

async function findCommissionById(id) {
  const cid = Number(id);
  if (!Number.isFinite(cid) || cid <= 0) return null;

  if (!isPostgresEnabled()) {
    const m = memoryStore.commissions.find((c) => Number(c.id) === cid);
    if (!m) return null;
    const artist = memoryStore.users.find((u) => Number(u.id) === Number(m.artistId));
    const artistUsername = artist
      ? String(artist.username || '').trim() ||
        String(artist.email || '')
          .split('@')[0]
          .trim() ||
        null
      : null;
    return { ...m, artistUsername };
  }

  const result = await query(
    `SELECT
      c.id,
      c.patron_id AS "patronId",
      c.artist_id AS "artistId",
      COALESCE(NULLIF(TRIM(ua.username), ''), split_part(ua.email, '@', 1), 'Artist') AS "artistUsername",
      c.title,
      c.client_name AS "clientName",
      c.description,
      c.last_message AS "lastMessage",
      c.budget,
      c.deadline,
      c.special_requirements AS "specialRequirements",
      c.is_urgent AS "isUrgent",
      c.reference_images AS "referenceImages",
      c.total_amount AS "totalAmount",
      c.status,
      c.created_at AS "createdAt",
      c.last_message_at AS "lastMessageAt",
      c.completed_at AS "completedAt",
      c.unread_for_artist AS "unreadForArtist",
      c.unread_for_patron AS "unreadForPatron",
      c.submission_round AS "submissionRound",
      c.payment_method AS "paymentMethod",
      c.escrow_status AS "escrowStatus",
      c.escrow_funded_at AS "escrowFundedAt",
      c.escrow_released_at AS "escrowReleasedAt",
      c.preferred_payment_method AS "preferredPaymentMethod",
      c.submission_images AS "submissionImages"
    FROM commissions c
    INNER JOIN users ua ON ua.id = c.artist_id
    WHERE c.id = $1 LIMIT 1`,
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
    preferredPaymentMethod:
      data.preferredPaymentMethod == null || String(data.preferredPaymentMethod).trim() === ''
        ? null
        : String(data.preferredPaymentMethod).trim().toLowerCase(),
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
      submissionRound: 0,
      submissionImages: [],
      paymentMethod: null,
      escrowStatus: 'none',
      escrowFundedAt: null,
      escrowReleasedAt: null,
      preferredPaymentMethod: row.preferredPaymentMethod ?? null,
    };
    memoryStore.commissions.push(m);
    return m;
  }

  const insertSql = `INSERT INTO commissions (
      patron_id, artist_id, title, client_name, description, budget, deadline,
      special_requirements, is_urgent, reference_images, total_amount, status,
      unread_for_artist, unread_for_patron, preferred_payment_method
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12::text, TRUE, FALSE, $13)
    RETURNING
      id,
      patron_id AS "patronId",
      artist_id AS "artistId",
      (SELECT COALESCE(NULLIF(TRIM(u.username), ''), split_part(u.email, '@', 1), 'Artist')
       FROM users u WHERE u.id = artist_id LIMIT 1) AS "artistUsername",
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
      unread_for_patron AS "unreadForPatron",
      submission_round AS "submissionRound",
      payment_method AS "paymentMethod",
      escrow_status AS "escrowStatus",
      escrow_funded_at AS "escrowFundedAt",
      escrow_released_at AS "escrowReleasedAt",
      preferred_payment_method AS "preferredPaymentMethod"`;

  const insertParams = [
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
  ];

  try {
    const result = await query(insertSql, [
      ...insertParams,
      'pending',
      row.preferredPaymentMethod,
    ]);
    return mapRow(result.rows[0]);
  } catch (e) {
    const msg = String(e?.message || '');
    if (
      e?.code === '23514' &&
      msg.includes('commissions_status_check') &&
      msg.includes('commissions')
    ) {
      const result = await query(insertSql, [
        ...insertParams,
        'inquiry',
        row.preferredPaymentMethod,
      ]);
      return mapRow(result.rows[0]);
    }
    throw e;
  }
}

const ALLOWED_ARTIST = {
  pending: ['accepted', 'rejected'],
  /** After patron funds escrow, revision rounds may return status to accepted — artist can submit again only when escrow is already funded (see guard below). */
  accepted: ['inProgress', 'rejected'],
  /** First work after payment: inProgress → inProgress bumps submission_round. */
  inProgress: ['inProgress', 'rejected'],
  completed: [],
  rejected: [],
};

/** Patron: fund escrow only after artist accepts (pending → inProgress is not allowed). */
const ALLOWED_PATRON = {
  accepted: ['inProgress'],
  inProgress: ['completed', 'accepted'],
};

const RETURNING_COMMISSION = `RETURNING
      id,
      patron_id AS "patronId",
      artist_id AS "artistId",
      (SELECT COALESCE(NULLIF(TRIM(u.username), ''), split_part(u.email, '@', 1), 'Artist')
       FROM users u WHERE u.id = artist_id LIMIT 1) AS "artistUsername",
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
      unread_for_patron AS "unreadForPatron",
      submission_round AS "submissionRound",
      payment_method AS "paymentMethod",
      escrow_status AS "escrowStatus",
      escrow_funded_at AS "escrowFundedAt",
      escrow_released_at AS "escrowReleasedAt",
      preferred_payment_method AS "preferredPaymentMethod",
      submission_images AS "submissionImages"`;

async function updateCommissionStatus(commissionId, newStatus, actingUserId, options = {}) {
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

  /** First-time: artist must not move accepted → inProgress until patron has funded escrow (patron pays after accept). Revision: patron may return to accepted with escrow still funded. */
  if (
    isArtist &&
    currentNormalized === 'accepted' &&
    nextStatus === 'inProgress' &&
    String(existing.escrowStatus || 'none') !== 'funded'
  ) {
    return { ok: false, reason: 'awaiting_patron_payment' };
  }

  const paymentMethodRaw = String(options.paymentMethod ?? '').trim().toLowerCase();
  const allowedPm = new Set(['gcash', 'paymaya', 'paypal', 'stripe']);
  const prevEscrow = String(existing.escrowStatus || 'none');

  if (isPatron && nextStatus === 'inProgress') {
    if (!allowedPm.has(paymentMethodRaw)) {
      return { ok: false, reason: 'payment_method_required' };
    }
  }

  const submissionList = Array.isArray(existing.submissionImages) ? existing.submissionImages : [];
  const hasDeliverable =
    submissionList.length > 0 || Number(existing.submissionRound ?? 0) > 0;

  if (isPatron && nextStatus === 'completed' && currentNormalized === 'inProgress') {
    if (!hasDeliverable) {
      return { ok: false, reason: 'no_submission_to_complete' };
    }
  }

  const fundEscrow = isPatron && nextStatus === 'inProgress';
  /** Patron completing after review: release simulated escrow when funded, or when deliverables exist but status was not flipped to funded (recovery). */
  const releaseEscrow =
    nextStatus === 'completed' &&
    isPatron &&
    prevEscrow !== 'released' &&
    prevEscrow !== 'refunded' &&
    (prevEscrow === 'funded' || (prevEscrow === 'none' && hasDeliverable));
  const refundEscrow = nextStatus === 'rejected' && prevEscrow === 'funded';
  const bumpSubmission =
    (isArtist && currentNormalized === 'accepted' && nextStatus === 'inProgress') ||
    (isArtist && currentNormalized === 'inProgress' && nextStatus === 'inProgress');

  if (bumpSubmission) {
    const urls = options.submissionImageUrls;
    if (!Array.isArray(urls) || urls.length === 0) {
      return { ok: false, reason: 'submission_images_required' };
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
    if (bumpSubmission) {
      m.submissionRound = Number(m.submissionRound ?? 0) + 1;
      m.submissionImages = options.submissionImageUrls;
    }
    m.status = nextStatus;
    if (nextStatus === 'completed') {
      m.completedAt = new Date().toISOString();
    }
    if (fundEscrow) {
      m.paymentMethod = paymentMethodRaw;
      m.escrowStatus = 'funded';
      m.escrowFundedAt = new Date().toISOString();
    }
    if (releaseEscrow) {
      m.escrowStatus = 'released';
      m.escrowReleasedAt = new Date().toISOString();
    }
    if (refundEscrow) {
      m.escrowStatus = 'refunded';
    }
    const artist = memoryStore.users.find((u) => Number(u.id) === Number(m.artistId));
    const artistUsername = artist
      ? String(artist.username || '').trim() ||
        String(artist.email || '')
          .split('@')[0]
          .trim() ||
        null
      : null;
    return { ok: true, commission: mapRow({ ...m, artistUsername }) };
  }

  const whereRole = isPatron ? 'patron_id' : 'artist_id';
  const submissionJson = JSON.stringify(
    Array.isArray(options.submissionImageUrls) ? options.submissionImageUrls : [],
  );

  const result = await query(
    `UPDATE commissions SET
      status = $2::text,
      completed_at = CASE WHEN $2::text = 'completed' THEN CURRENT_TIMESTAMP ELSE completed_at END,
      submission_round = CASE WHEN $8::boolean THEN submission_round + 1 ELSE submission_round END,
      submission_images = CASE WHEN $8::boolean THEN $9::jsonb ELSE submission_images END,
      payment_method = CASE WHEN $4::boolean THEN $5::text ELSE payment_method END,
      escrow_status = CASE
        WHEN $4::boolean THEN 'funded'
        WHEN $6::boolean THEN 'released'
        WHEN $7::boolean THEN 'refunded'
        ELSE escrow_status
      END,
      escrow_funded_at = CASE WHEN $4::boolean THEN CURRENT_TIMESTAMP ELSE escrow_funded_at END,
      escrow_released_at = CASE WHEN $6::boolean THEN CURRENT_TIMESTAMP ELSE escrow_released_at END
    WHERE id = $1 AND ${whereRole} = $3
    ${RETURNING_COMMISSION}`,
    [
      cid,
      nextStatus,
      uid,
      fundEscrow,
      paymentMethodRaw,
      releaseEscrow,
      refundEscrow,
      bumpSubmission,
      submissionJson,
    ],
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
