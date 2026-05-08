const reportsRepository = require('../repositories/reportsRepository');
const contentRepository = require('../repositories/contentRepository');
const authRepository = require('../repositories/authRepository');
const notificationsRepository = require('../repositories/notificationsRepository');
const moderationRepository = require('../repositories/moderationRepository');

async function listReports(query) {
  const raw = query?.status;
  const status =
    raw == null || raw === ''
      ? 'all'
      : String(raw).trim().toLowerCase();
  const allowed = new Set(['all', 'pending', 'resolved', 'dismissed']);
  if (!allowed.has(status)) {
    const error = new Error('Invalid status filter.');
    error.statusCode = 400;
    throw error;
  }
  const reports = await reportsRepository.listReportsForAdmin({ status });

  function normalizedTargetKind(row) {
    return String(row?.targetKind ?? '')
      .trim()
      .toLowerCase();
  }

  function safePositiveInt(v) {
    const n = Number.parseInt(String(v ?? ''), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  const postIds = [
    ...new Set(
      reports.flatMap((r) => {
        if (normalizedTargetKind(r) !== 'post') return [];
        const pid = safePositiveInt(r.targetId);
        return pid == null ? [] : [pid];
      }),
    ),
  ];
  const postsById = await contentRepository.fetchPostsForAdminByIds(postIds);
  const enriched = reports.map((r) => {
    const row = { ...r, targetPost: null };
    if (normalizedTargetKind(r) === 'post') {
      const pid = safePositiveInt(r.targetId);
      if (pid != null) {
        row.targetPost = postsById[String(pid)] ?? null;
      }
    }
    return row;
  });
  return { reports: enriched };
}

function _parseBool(v) {
  return v === true || v === 'true' || v === 1 || v === '1';
}

function _parseBanDays(raw) {
  if (raw == null || raw === '') return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(3650, Math.floor(n));
}

/**
 * @param {number} userId
 * @param {number} days
 * @returns {Promise<{ bannedUntil: string|null, banStrikeCount: number, permanentlyBannedAt: string|null }|null>}
 */
async function _extendBanByDays(userId, days) {
  const uid = Number(userId);
  if (!Number.isFinite(uid) || uid <= 0 || days <= 0) return null;
  const user = await authRepository.findUserById(uid);
  if (!user) return null;
  if (user.permanentlyBannedAt != null) {
    return {
      bannedUntil: null,
      banStrikeCount: Number(user.banStrikeCount ?? 0),
      permanentlyBannedAt: user.permanentlyBannedAt,
    };
  }
  const now = Date.now();
  let base = now;
  const cur = user.bannedUntil ? new Date(user.bannedUntil).getTime() : NaN;
  if (Number.isFinite(cur) && cur > base) {
    base = cur;
  }
  const until = new Date(base + days * 86400000);
  return authRepository.applyBanStrike(uid, until);
}

/**
 * @param {import('express').Request['user']} adminUser — from JWT (`req.user`)
 */
async function resolveReport(reportId, input, adminUser) {
  const id = Number(reportId);
  if (!Number.isFinite(id) || id <= 0) {
    const error = new Error('Invalid report id.');
    error.statusCode = 400;
    throw error;
  }

  const adminId = Number(adminUser?.id);
  if (!Number.isFinite(adminId) || adminId <= 0) {
    const error = new Error('Authentication required.');
    error.statusCode = 401;
    throw error;
  }

  const existing = await reportsRepository.getReportById(id);
  if (!existing) {
    const error = new Error('Report not found.');
    error.statusCode = 404;
    throw error;
  }

  const st = String(input?.status ?? '').trim().toLowerCase();
  if (st !== 'resolved' && st !== 'dismissed') {
    const error = new Error('Status must be "resolved" or "dismissed".');
    error.statusCode = 400;
    throw error;
  }
  const resolutionNote =
    input?.resolutionNote == null
      ? null
      : String(input.resolutionNote).trim().slice(0, 2000);

  const deleteReportedPost = st === 'resolved' && _parseBool(input?.deleteReportedPost);
  const sendWarning = st === 'resolved' && _parseBool(input?.sendWarning);
  const banDays = st === 'resolved' ? _parseBanDays(input?.banDays) : 0;

  /** @type {{ postDeleted: boolean, warningSent: boolean, bannedUntil: string | null, banStrikeCount: number, permanentlyBanned: boolean }} */
  const moderation = {
    postDeleted: false,
    warningSent: false,
    bannedUntil: null,
    banStrikeCount: 0,
    permanentlyBanned: false,
  };

  if (st === 'resolved' && (deleteReportedPost || sendWarning || banDays > 0)) {
    const kind = String(existing.targetKind ?? '')
      .trim()
      .toLowerCase();
    const targetId = Number.parseInt(String(existing.targetId ?? ''), 10);

    let reportedUserId = null;
    if (kind === 'user' && Number.isFinite(targetId) && targetId > 0) {
      reportedUserId = targetId;
    } else if (kind === 'post' && Number.isFinite(targetId) && targetId > 0) {
      reportedUserId = await contentRepository.getPostOwnerUserId(targetId);
    }

    if (
      (sendWarning || banDays > 0) &&
      reportedUserId != null &&
      Number(reportedUserId) === adminId
    ) {
      const error = new Error('You cannot warn or ban your own account.');
      error.statusCode = 400;
      throw error;
    }

    if (deleteReportedPost && kind === 'post' && Number.isFinite(targetId) && targetId > 0) {
      moderation.postDeleted = await contentRepository.deletePostAsAdmin(targetId);
      if (moderation.postDeleted && reportedUserId != null) {
        await moderationRepository.insertModerationAction({
          targetUserId: reportedUserId,
          adminUserId: adminId,
          reportId: id,
          actionType: 'post_deleted',
          reason: resolutionNote || null,
          details: { targetKind: kind, targetId },
        });
      }
    }

    if (sendWarning && reportedUserId != null) {
      const row = await notificationsRepository.insertNotification({
        userId: reportedUserId,
        type: 'moderation_warning',
        title: 'Community guidelines reminder',
        body:
          'A moderator reviewed a report about your account or content. ' +
          'Please follow our community guidelines.',
        payload: { reportId: id },
      });
      moderation.warningSent = Boolean(row);
      if (moderation.warningSent) {
        await moderationRepository.insertModerationAction({
          targetUserId: reportedUserId,
          adminUserId: adminId,
          reportId: id,
          actionType: 'warning',
          reason: resolutionNote || null,
          details: { targetKind: kind, targetId },
        });
      }
    }

    if (banDays > 0 && reportedUserId != null) {
      const banResult = await _extendBanByDays(reportedUserId, banDays);
      moderation.bannedUntil = banResult?.bannedUntil ?? null;
      moderation.banStrikeCount = Number(banResult?.banStrikeCount ?? 0);
      moderation.permanentlyBanned = banResult?.permanentlyBannedAt != null;
      if (banResult != null) {
        await moderationRepository.insertModerationAction({
          targetUserId: reportedUserId,
          adminUserId: adminId,
          reportId: id,
          actionType: moderation.permanentlyBanned ? 'permanent_ban' : 'temp_ban',
          reason: resolutionNote || null,
          details: {
            targetKind: kind,
            targetId,
            banDays,
            banStrikeCount: moderation.banStrikeCount,
            bannedUntil: moderation.bannedUntil,
          },
        });
      }
    }
  }

  const report = await reportsRepository.resolveReportById(id, {
    status: st,
    resolutionNote: resolutionNote || null,
  });
  if (!report) {
    const error = new Error('Report not found.');
    error.statusCode = 404;
    throw error;
  }
  report.targetPost = null;
  const rk = String(report.targetKind ?? '')
    .trim()
    .toLowerCase();
  if (rk === 'post') {
    const pid = Number.parseInt(String(report.targetId ?? ''), 10);
    if (Number.isFinite(pid) && pid > 0) {
      const byId = await contentRepository.fetchPostsForAdminByIds([pid]);
      report.targetPost = byId[String(pid)] ?? null;
    }
  }
  return { report, moderation };
}

module.exports = {
  listReports,
  resolveReport,
};
