const authRepository = require('../repositories/authRepository');
const followsRepository = require('../repositories/followsRepository');
const notificationsRepository = require('../repositories/notificationsRepository');
const { extractMentionHandles } = require('../utils/mentionUtils');

function scheduleWork(fn) {
  setImmediate(() => {
    Promise.resolve(fn()).catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[notifications]', err);
    });
  });
}

function displayNameFromUser(user) {
  const u = user?.username;
  if (u && String(u).trim()) return String(u).trim();
  const e = user?.email;
  if (e && String(e).includes('@')) return String(e).split('@')[0];
  return 'Someone';
}

async function listForUser(userId, query) {
  const limit = query?.limit;
  const before = query?.before;
  let beforeId = null;
  if (before != null && before !== '') {
    const n = Number(before);
    if (Number.isFinite(n) && n > 0) beforeId = n;
  }
  const notifications = await notificationsRepository.listNotificationsForUser(userId, {
    limit: limit == null ? 30 : Number(limit),
    beforeId,
  });
  const nextBefore =
    notifications.length > 0 ? notifications[notifications.length - 1].id : null;
  return { notifications, nextBeforeId: nextBefore };
}

async function unreadCount(userId) {
  const count = await notificationsRepository.unreadCountForUser(userId);
  return { count };
}

async function markRead(notificationId, userId) {
  const ok = await notificationsRepository.markNotificationRead(notificationId, userId);
  if (!ok) {
    const err = new Error('Notification not found.');
    err.statusCode = 404;
    throw err;
  }
  return { success: true };
}

async function markAllRead(userId) {
  const marked = await notificationsRepository.markAllNotificationsRead(userId);
  return { success: true, marked };
}

async function registerDevice(userId, input) {
  const ok = await notificationsRepository.upsertPushDevice(
    userId,
    input?.token,
    input?.platform,
  );
  if (!ok) {
    const err = new Error('Invalid token or platform.');
    err.statusCode = 400;
    throw err;
  }
  return { success: true };
}

async function unregisterDevice(userId, input) {
  const ok = await notificationsRepository.deletePushDevice(userId, input?.token);
  return { success: ok };
}

function notifyNewMessage(recipientIds, senderUser, preview, payload) {
  const ids = [...new Set((recipientIds || []).map(Number).filter((n) => n > 0))];
  const senderName = displayNameFromUser(senderUser);
  const bodyPreview =
    preview.length > 120 ? `${preview.slice(0, 117)}...` : preview;

  scheduleWork(async () => {
    await Promise.all(
      ids.map((userId) =>
        notificationsRepository.insertNotification({
          userId,
          type: 'message',
          title: 'New message',
          body: `${senderName}: ${bodyPreview}`,
          payload: { ...payload, senderId: senderUser?.id },
        }),
      ),
    );
  });
}

function notifyPostLiked(ownerId, likerUser, postId) {
  const owner = Number(ownerId);
  const likerId = Number(likerUser?.id);
  if (!Number.isFinite(owner) || owner <= 0 || owner === likerId) return;

  const likerName = displayNameFromUser(likerUser);
  scheduleWork(async () => {
    await notificationsRepository.insertNotification({
      userId: owner,
      type: 'post_like',
      title: 'New like',
      body: `${likerName} liked your post.`,
      payload: { postId: Number(postId) },
    });
  });
}

function notifyPostComment(ownerId, commenterUser, postId) {
  const owner = Number(ownerId);
  const cid = Number(commenterUser?.id);
  if (!Number.isFinite(owner) || owner <= 0 || owner === cid) return;

  const name = displayNameFromUser(commenterUser);
  scheduleWork(async () => {
    await notificationsRepository.insertNotification({
      userId: owner,
      type: 'post_comment',
      title: 'New comment',
      body: `${name} commented on your post.`,
      payload: { postId: Number(postId) },
    });
  });
}

function notifyNewFollower(followedUserId, followerUser) {
  const target = Number(followedUserId);
  const followerId = Number(followerUser?.id);
  if (!Number.isFinite(target) || target <= 0 || target === followerId) return;

  const name = displayNameFromUser(followerUser);
  scheduleWork(async () => {
    await notificationsRepository.insertNotification({
      userId: target,
      type: 'follow',
      title: 'New follower',
      body: `${name} started following you.`,
      payload: { followerId },
    });
  });
}

function notifyMentionsInText(text, authorUser, context, payloadExtra = {}) {
  const handles = extractMentionHandles(text);
  if (!handles.length) {
    return;
  }
  const authorId = Number(authorUser?.id);
  if (!Number.isFinite(authorId) || authorId <= 0) {
    return;
  }
  const preview = text.length > 120 ? `${text.slice(0, 117)}...` : text;
  const name = displayNameFromUser(authorUser);

  scheduleWork(async () => {
    const ids = await authRepository.findUserIdsForMentionHandles(handles, authorId);
    const targets = ids.filter((uid) => uid !== authorId);
    await Promise.all(
      targets.map((userId) =>
        notificationsRepository.insertNotification({
          userId,
          type: 'mention',
          title: 'You were mentioned',
          body: `${name} mentioned you: ${preview}`,
          payload: { context, ...payloadExtra },
        }),
      ),
    );
  });
}

function notifyFollowersNewEvent(creatorUser, event) {
  const creatorId = Number(creatorUser?.id);
  const eventId = Number(event?.id);
  if (!Number.isFinite(creatorId) || creatorId <= 0 || !Number.isFinite(eventId) || eventId <= 0) {
    return;
  }
  const name = displayNameFromUser(creatorUser);
  const titleText = String(event?.title ?? 'Event').trim() || 'Event';

  scheduleWork(async () => {
    const followerIds = await followsRepository.listFollowerUserIds(creatorId);
    const targets = followerIds.filter((id) => id !== creatorId);
    await Promise.all(
      targets.map((userId) =>
        notificationsRepository.insertNotification({
          userId,
          type: 'event_new',
          title: 'New event from someone you follow',
          body: `${name} posted "${titleText}".`,
          payload: { eventId },
        }),
      ),
    );
  });
}

function notifyFollowersEventUpdated(creatorUser, event) {
  const creatorId = Number(creatorUser?.id);
  const eventId = Number(event?.id);
  if (!Number.isFinite(creatorId) || creatorId <= 0 || !Number.isFinite(eventId) || eventId <= 0) {
    return;
  }
  const name = displayNameFromUser(creatorUser);
  const titleText = String(event?.title ?? 'Event').trim() || 'Event';

  scheduleWork(async () => {
    const followerIds = await followsRepository.listFollowerUserIds(creatorId);
    const targets = followerIds.filter((id) => id !== creatorId);
    await Promise.all(
      targets.map((userId) =>
        notificationsRepository.insertNotification({
          userId,
          type: 'event_updated',
          title: 'Event updated',
          body: `${name} updated "${titleText}".`,
          payload: { eventId },
        }),
      ),
    );
  });
}

function notifyCommissionToArtist(artistId, patronUser, commission) {
  const aid = Number(artistId);
  const pid = Number(patronUser?.id);
  if (!Number.isFinite(aid) || aid <= 0 || aid === pid) {
    return;
  }
  const name = displayNameFromUser(patronUser);
  const titleText = String(commission?.title ?? 'Commission').trim() || 'Commission';
  scheduleWork(async () => {
    await notificationsRepository.insertNotification({
      userId: aid,
      type: 'commission_request',
      title: 'New commission request',
      body: `${name} requested "${titleText}".`,
      payload: { commissionId: Number(commission?.id) },
    });
  });
}

function notifyCommissionPatronConfirmedPayment(artistId, patronUser, commission) {
  const aid = Number(artistId);
  const pid = Number(patronUser?.id);
  if (!Number.isFinite(aid) || aid <= 0 || aid === pid) {
    return;
  }
  const patronName = displayNameFromUser(patronUser);
  const titleText = String(commission?.title ?? 'A commission').trim() || 'A commission';
  scheduleWork(async () => {
    await notificationsRepository.insertNotification({
      userId: aid,
      type: 'commission_update',
      title: 'Payment confirmed',
      body: `${patronName} confirmed payment for "${titleText}". You can start work.`,
      payload: { commissionId: Number(commission?.id), status: 'inProgress' },
    });
  });
}

function notifyCommissionPatronRequestedRevision(artistId, patronUser, commission) {
  const aid = Number(artistId);
  const pid = Number(patronUser?.id);
  if (!Number.isFinite(aid) || aid <= 0 || aid === pid) {
    return;
  }
  const patronName = displayNameFromUser(patronUser);
  const titleText = String(commission?.title ?? 'A commission').trim() || 'A commission';
  scheduleWork(async () => {
    await notificationsRepository.insertNotification({
      userId: aid,
      type: 'commission_update',
      title: 'Revision requested',
      body: `${patronName} asked for changes on "${titleText}". Submit an updated version when ready.`,
      payload: { commissionId: Number(commission?.id), status: 'accepted' },
    });
  });
}

function notifyCommissionReleasedToArtist(artistId, patronUser, commission) {
  const aid = Number(artistId);
  const pid = Number(patronUser?.id);
  if (!Number.isFinite(aid) || aid <= 0 || aid === pid) {
    return;
  }
  const patronName = displayNameFromUser(patronUser);
  const titleText = String(commission?.title ?? 'A commission').trim() || 'A commission';
  scheduleWork(async () => {
    await notificationsRepository.insertNotification({
      userId: aid,
      type: 'commission_update',
      title: 'Commission completed',
      body: `${patronName} accepted the final work for "${titleText}". Payout will be processed per escrow terms.`,
      payload: { commissionId: Number(commission?.id), status: 'completed' },
    });
  });
}

function notifyCommissionStatusToPatron(patronId, artistUser, commission, newStatus) {
  const p = Number(patronId);
  const aid = Number(artistUser?.id);
  if (!Number.isFinite(p) || p <= 0 || p === aid) {
    return;
  }
  const artistName = displayNameFromUser(artistUser);
  const titleText = String(commission?.title ?? 'Your commission').trim() || 'Your commission';
  const statusLabels = {
    pending: 'pending',
    inquiry: 'pending',
    accepted: 'accepted',
    inProgress: 'in progress',
    completed: 'completed',
    rejected: 'rejected',
  };
  const statusLabel = statusLabels[String(newStatus)] || String(newStatus || 'updated');
  const body = `${artistName} moved "${titleText}" to ${statusLabel}.`;

  scheduleWork(async () => {
    await notificationsRepository.insertNotification({
      userId: p,
      type: 'commission_update',
      title: 'Commission update',
      body,
      payload: { commissionId: Number(commission?.id), status: newStatus },
    });
  });
}

async function broadcastSystemAnnouncement(input) {
  const title = String(input?.title ?? '').trim();
  const body = String(input?.body ?? '').trim();
  if (!title || !body) {
    const err = new Error('Title and body are required.');
    err.statusCode = 400;
    throw err;
  }
  const payload = typeof input?.payload === 'object' && input.payload !== null ? input.payload : {};

  let userIds = Array.isArray(input?.userIds) ? input.userIds.map(Number).filter((n) => n > 0) : [];
  if (input?.all === true) {
    userIds = await authRepository.listAllUserIds();
  }

  userIds = [...new Set(userIds)];
  if (!userIds.length) {
    const err = new Error('Provide userIds or set all to true.');
    err.statusCode = 400;
    throw err;
  }

  await Promise.all(
    userIds.map((userId) =>
      notificationsRepository.insertNotification({
        userId,
        type: 'system',
        title,
        body,
        payload: { ...payload, kind: 'announcement' },
      }),
    ),
  );
  return { sent: userIds.length };
}

module.exports = {
  listForUser,
  unreadCount,
  markRead,
  markAllRead,
  registerDevice,
  unregisterDevice,
  notifyNewMessage,
  notifyPostLiked,
  notifyPostComment,
  notifyNewFollower,
  notifyMentionsInText,
  notifyFollowersNewEvent,
  notifyFollowersEventUpdated,
  notifyCommissionToArtist,
  notifyCommissionPatronConfirmedPayment,
  notifyCommissionPatronRequestedRevision,
  notifyCommissionReleasedToArtist,
  notifyCommissionStatusToPatron,
  broadcastSystemAnnouncement,
};
