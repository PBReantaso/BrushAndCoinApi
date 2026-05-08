const moderationRepository = require('../repositories/moderationRepository');
const authRepository = require('../repositories/authRepository');

async function listMyEnforcementHistory(user, query) {
  const uid = Number(user?.id);
  if (!Number.isFinite(uid) || uid <= 0) {
    const err = new Error('Authentication required.');
    err.statusCode = 401;
    throw err;
  }
  const limit = Number.parseInt(String(query?.limit ?? ''), 10);
  const actions = await moderationRepository.listModerationActionsForUser(
    uid,
    Number.isFinite(limit) ? limit : 50,
  );
  return { actions };
}

async function listMyAppeals(user, query) {
  const uid = Number(user?.id);
  if (!Number.isFinite(uid) || uid <= 0) {
    const err = new Error('Authentication required.');
    err.statusCode = 401;
    throw err;
  }
  const limit = Number.parseInt(String(query?.limit ?? ''), 10);
  const appeals = await moderationRepository.listAppealsForUser(
    uid,
    Number.isFinite(limit) ? limit : 50,
  );
  return { appeals };
}

async function submitMyAppeal(user, input) {
  const uid = Number(user?.id);
  if (!Number.isFinite(uid) || uid <= 0) {
    const err = new Error('Authentication required.');
    err.statusCode = 401;
    throw err;
  }
  const message = String(input?.message ?? '').trim();
  if (!message) {
    const err = new Error('Appeal message is required.');
    err.statusCode = 400;
    throw err;
  }
  const moderationActionId = input?.moderationActionId == null ? null : Number(input.moderationActionId);
  const appeal = await moderationRepository.createAppeal({
    userId: uid,
    moderationActionId: Number.isFinite(moderationActionId) && moderationActionId > 0 ? moderationActionId : null,
    message,
  });
  if (!appeal) {
    const err = new Error('Could not submit appeal.');
    err.statusCode = 400;
    throw err;
  }
  return { appeal };
}

async function listAdminModerationActions(query) {
  const rawLimit = Number.parseInt(String(query?.limit ?? ''), 10);
  const actions = await moderationRepository.listModerationActionsForAdmin(
    Number.isFinite(rawLimit) ? rawLimit : 100,
  );
  return { actions };
}

async function listAdminAppeals(query) {
  const rawLimit = Number.parseInt(String(query?.limit ?? ''), 10);
  const status = String(query?.status ?? 'all').trim().toLowerCase() || 'all';
  const appeals = await moderationRepository.listAppealsForAdmin({
    status,
    limit: Number.isFinite(rawLimit) ? rawLimit : 100,
  });
  return { appeals };
}

async function resolveAdminAppeal(appealId, input, adminUser) {
  const adminId = Number(adminUser?.id);
  if (!Number.isFinite(adminId) || adminId <= 0) {
    const err = new Error('Authentication required.');
    err.statusCode = 401;
    throw err;
  }
  const st = String(input?.status ?? '').trim().toLowerCase();
  if (st !== 'approved' && st !== 'rejected') {
    const err = new Error('Status must be "approved" or "rejected".');
    err.statusCode = 400;
    throw err;
  }
  const adminNote =
    input?.adminNote == null ? null : String(input.adminNote).trim();
  const appeal = await moderationRepository.resolveAppeal(appealId, {
    status: st,
    adminNote: adminNote || null,
    adminUserId: adminId,
  });
  if (!appeal) {
    const err = new Error('Appeal not found or already resolved.');
    err.statusCode = 404;
    throw err;
  }
  if (st === 'approved') {
    await authRepository.clearUserBan(Number(appeal.userId));
  }
  return { appeal };
}

module.exports = {
  listMyEnforcementHistory,
  listMyAppeals,
  submitMyAppeal,
  listAdminModerationActions,
  listAdminAppeals,
  resolveAdminAppeal,
};

