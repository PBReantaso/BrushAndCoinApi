const authRepository = require('../repositories/authRepository');
const contentRepository = require('../repositories/contentRepository');
const commissionsRepository = require('../repositories/commissionsRepository');
const followsRepository = require('../repositories/followsRepository');
const notificationsService = require('./notificationsService');
const { saveSubmissionImages } = require('../utils/commissionSubmissionFiles');

function actorDisplayName(user) {
  const u = user?.username;
  if (u && String(u).trim()) return String(u).trim();
  const e = user?.email;
  if (e && String(e).includes('@')) return String(e).split('@')[0];
  return 'Artist';
}

async function listCommissions(user) {
  const userId = Number(user?.id);
  if (!Number.isFinite(userId) || userId <= 0) {
    const err = new Error('Authentication required.');
    err.statusCode = 401;
    throw err;
  }
  const commissions = await commissionsRepository.listCommissionsForUser(userId);
  return { commissions };
}

async function getCommission(commissionId, user) {
  const userId = Number(user?.id);
  if (!Number.isFinite(userId) || userId <= 0) {
    const err = new Error('Authentication required.');
    err.statusCode = 401;
    throw err;
  }
  const row = await commissionsRepository.findCommissionByIdForUser(commissionId, userId);
  if (!row) {
    const err = new Error('Commission not found.');
    err.statusCode = 404;
    throw err;
  }
  return { commission: commissionsRepository.toApiCommission(row) };
}

/** Clears unread-for-viewer on the commission list (same as opening the thread in chat). */
async function markCommissionViewed(commissionId, user) {
  const userId = Number(user?.id);
  const cid = Number(commissionId);
  if (!Number.isFinite(userId) || userId <= 0) {
    const err = new Error('Authentication required.');
    err.statusCode = 401;
    throw err;
  }
  if (!Number.isFinite(cid) || cid <= 0) {
    const err = new Error('Invalid commission id.');
    err.statusCode = 400;
    throw err;
  }
  const row = await commissionsRepository.findCommissionByIdForUser(cid, userId);
  if (!row) {
    const err = new Error('Commission not found.');
    err.statusCode = 404;
    throw err;
  }
  await commissionsRepository.markCommissionThreadViewed(cid, userId);
  // Align with opening the commission chat: clear message unread-count for this thread.
  const convo = await contentRepository.findConversationByCommissionId(cid);
  if (convo?.id != null) {
    await contentRepository.upsertConversationRead(convo.id, userId);
  }
  return { ok: true };
}

async function createCommission(input, user) {
  const patronId = Number(user?.id);
  if (!Number.isFinite(patronId) || patronId <= 0) {
    const err = new Error('Authentication required.');
    err.statusCode = 401;
    throw err;
  }

  const artistId = Number(input?.artistId);
  if (!Number.isFinite(artistId) || artistId <= 0) {
    const err = new Error('artistId is required.');
    err.statusCode = 400;
    throw err;
  }
  if (artistId === patronId) {
    const err = new Error('You cannot commission yourself.');
    err.statusCode = 400;
    throw err;
  }

  const artist = await authRepository.findPublicUserById(artistId);
  if (!artist) {
    const err = new Error('Artist not found.');
    err.statusCode = 404;
    throw err;
  }

  if (await authRepository.isUserPrivate(artistId)) {
    const ok = await followsRepository.isFollowing(patronId, artistId);
    if (!ok) {
      const err = new Error(
        'This artist has a private account. Follow them to request a commission.',
      );
      err.statusCode = 403;
      throw err;
    }
  }

  const title = String(input?.title ?? '').trim();
  if (!title) {
    const err = new Error('Title is required.');
    err.statusCode = 400;
    throw err;
  }

  const rawPreferred = String(input?.preferredPaymentMethod ?? '').trim().toLowerCase();
  const allowedPreferred = new Set(['gcash', 'paymaya', 'paypal', 'stripe']);
  let preferredPaymentMethod = null;
  if (rawPreferred) {
    if (!allowedPreferred.has(rawPreferred)) {
      const err = new Error('preferredPaymentMethod must be gcash, paymaya, paypal, or stripe.');
      err.statusCode = 400;
      throw err;
    }
    preferredPaymentMethod = rawPreferred;
  }

  const created = await commissionsRepository.createCommission({
    patronId,
    artistId,
    title,
    clientName: String(input?.clientName ?? '').trim() || 'Client',
    description: String(input?.description ?? ''),
    budget: Number(input?.budget ?? 0),
    deadline: input?.deadline,
    specialRequirements: String(input?.specialRequirements ?? ''),
    isUrgent: Boolean(input?.isUrgent),
    referenceImages: Array.isArray(input?.referenceImages) ? input.referenceImages : [],
    totalAmount: Number(input?.totalAmount ?? 0),
    preferredPaymentMethod,
  });

  if (!created) {
    const err = new Error('Could not create commission.');
    err.statusCode = 400;
    throw err;
  }

  notificationsService.notifyCommissionToArtist(artistId, user, created);

  return { commission: commissionsRepository.toApiCommission(created) };
}

async function updateCommissionStatus(commissionId, input, user) {
  const uid = Number(user?.id);
  if (!Number.isFinite(uid) || uid <= 0) {
    const err = new Error('Authentication required.');
    err.statusCode = 401;
    throw err;
  }

  const status = String(input?.status ?? '').trim();
  if (!status) {
    const err = new Error('status is required.');
    err.statusCode = 400;
    throw err;
  }

  const existing = await commissionsRepository.findCommissionById(commissionId);
  if (!existing) {
    const err = new Error('Commission not found.');
    err.statusCode = 404;
    throw err;
  }

  const oldStatus =
    String(existing.status) === 'inquiry' ? 'pending' : String(existing.status);

  const nextStatusNormalized = status === 'inquiry' ? 'pending' : status;
  const isArtist = Number(existing.artistId) === uid;
  const bumpSubmission =
    isArtist &&
    nextStatusNormalized === 'inProgress' &&
    ((oldStatus === 'accepted' && String(existing.escrowStatus || 'none') === 'funded') ||
      oldStatus === 'inProgress');

  let submissionImageUrls;
  if (bumpSubmission) {
    const parts = input.submissionImages;
    submissionImageUrls = saveSubmissionImages(
      Number(commissionId),
      Array.isArray(parts) ? parts : [],
    );
    if (!submissionImageUrls || submissionImageUrls.length === 0) {
      const err = new Error('At least one artwork image is required to submit work.');
      err.statusCode = 400;
      throw err;
    }
  }

  const result = await commissionsRepository.updateCommissionStatus(commissionId, status, uid, {
    paymentMethod: input?.paymentMethod,
    submissionImageUrls,
  });
  if (!result.ok) {
    if (result.reason === 'not_found') {
      const err = new Error('Commission not found.');
      err.statusCode = 404;
      throw err;
    }
    if (result.reason === 'forbidden') {
      const err = new Error(
        'You are not allowed to update this commission.',
      );
      err.statusCode = 403;
      throw err;
    }
    if (result.reason === 'payment_method_required') {
      const err = new Error(
        'Payment method is required. Funds are held in escrow until the commission is completed.',
      );
      err.statusCode = 400;
      throw err;
    }
    if (result.reason === 'awaiting_patron_payment') {
      const err = new Error(
        'The patron must complete payment before you can submit work on this commission.',
      );
      err.statusCode = 400;
      throw err;
    }
    if (result.reason === 'submission_images_required') {
      const err = new Error('At least one artwork image is required to submit work.');
      err.statusCode = 400;
      throw err;
    }
    if (result.reason === 'no_submission_to_complete') {
      const err = new Error(
        'There is no submitted artwork to accept yet. Wait for the artist to submit work first.',
      );
      err.statusCode = 400;
      throw err;
    }
    if (result.reason === 'invalid_transition' || result.reason === 'invalid_status') {
      const err = new Error('Invalid status change.');
      err.statusCode = 400;
      throw err;
    }
    const err = new Error('Could not update commission.');
    err.statusCode = 400;
    throw err;
  }

  const patronId = Number(existing.patronId);
  const artistId = Number(existing.artistId);
  const newStatus = String(result.commission.status);

  const patronConfirmedPayment =
    uid === patronId && oldStatus === 'accepted' && newStatus === 'inProgress';

  if (patronConfirmedPayment && Number.isFinite(artistId) && artistId > 0) {
    notificationsService.notifyCommissionPatronConfirmedPayment(artistId, user, result.commission);
  }

  const artistSubmittedWork =
    uid === artistId &&
    Number.isFinite(artistId) &&
    artistId > 0 &&
    newStatus === 'inProgress' &&
    (oldStatus === 'inProgress' ||
      (oldStatus === 'accepted' && String(existing.escrowStatus || 'none') === 'funded'));

  if (artistSubmittedWork) {
    try {
      const round = Number(result.commission.submissionRound ?? 1);
      await contentRepository.appendWorkSubmittedNotice(commissionId, uid, round);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[commissions] work submitted chat line', e);
    }
  }

  if (
    uid === artistId &&
    oldStatus === 'pending' &&
    newStatus === 'accepted' &&
    Number.isFinite(artistId) &&
    artistId > 0
  ) {
    try {
      const patronLabel =
        String(existing.clientName || result.commission.clientName || 'Patron').trim() ||
        'Patron';
      const artistLabel = actorDisplayName(user);
      await contentRepository.appendCommissionAcceptedNotice(
        Number(commissionId),
        artistId,
        artistLabel,
        patronLabel,
      );
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[commissions] accept chat line', e);
    }
  }

  if (
    uid === patronId &&
    oldStatus === 'inProgress' &&
    newStatus === 'accepted' &&
    Number.isFinite(artistId) &&
    artistId > 0
  ) {
    notificationsService.notifyCommissionPatronRequestedRevision(artistId, user, result.commission);
  }

  if (
    Number.isFinite(patronId) &&
    patronId > 0 &&
    newStatus !== oldStatus &&
    uid !== patronId
  ) {
    notificationsService.notifyCommissionStatusToPatron(patronId, user, result.commission, newStatus);
  }

  if (newStatus === 'completed') {
    try {
      await contentRepository.appendCommissionCompletionChatLine(
        Number(commissionId),
        Number(existing.artistId),
      );
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[commissions] completion chat line', e);
    }
  }

  if (
    newStatus === 'completed' &&
    uid === patronId &&
    Number.isFinite(artistId) &&
    artistId > 0
  ) {
    notificationsService.notifyCommissionReleasedToArtist(artistId, user, result.commission);
  }

  return { commission: commissionsRepository.toApiCommission(result.commission) };
}

module.exports = {
  listCommissions,
  getCommission,
  markCommissionViewed,
  createCommission,
  updateCommissionStatus,
};
