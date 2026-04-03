const authRepository = require('../repositories/authRepository');
const commissionsRepository = require('../repositories/commissionsRepository');
const followsRepository = require('../repositories/followsRepository');
const notificationsService = require('./notificationsService');

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

  const result = await commissionsRepository.updateCommissionStatus(commissionId, status, uid);
  if (!result.ok) {
    if (result.reason === 'not_found') {
      const err = new Error('Commission not found.');
      err.statusCode = 404;
      throw err;
    }
    if (result.reason === 'forbidden') {
      const err = new Error('Only the assigned artist can update this commission.');
      err.statusCode = 403;
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
  if (Number.isFinite(patronId) && patronId > 0 && status !== String(existing.status)) {
    notificationsService.notifyCommissionStatusToPatron(patronId, user, result.commission, status);
  }

  return { commission: commissionsRepository.toApiCommission(result.commission) };
}

module.exports = {
  listCommissions,
  createCommission,
  updateCommissionStatus,
};
