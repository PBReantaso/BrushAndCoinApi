const { isPostgresEnabled, query } = require('../config/database');
const { memoryStore } = require('../data/memoryStore');

function _serializePayload(payload) {
  if (payload == null || typeof payload !== 'object') return {};
  return payload;
}

async function insertNotification({ userId, type, title, body, payload }) {
  const uid = Number(userId);
  if (!Number.isFinite(uid) || uid <= 0) return null;

  const typeStr = String(type ?? '').trim();
  const titleStr = String(title ?? '').trim();
  if (!typeStr || !titleStr) return null;

  const bodyStr = String(body ?? '');
  const p = _serializePayload(payload);

  if (!isPostgresEnabled()) {
    const nextId = (memoryStore.notifications.at(-1)?.id ?? 0) + 1;
    const row = {
      id: nextId,
      userId: uid,
      type: typeStr,
      title: titleStr,
      body: bodyStr,
      payload: { ...p },
      readAt: null,
      createdAt: new Date().toISOString(),
    };
    memoryStore.notifications.push(row);
    return row;
  }

  const result = await query(
    `INSERT INTO notifications (user_id, type, title, body, payload)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     RETURNING
       id,
       user_id AS "userId",
       type,
       title,
       body,
       payload,
       read_at AS "readAt",
       created_at AS "createdAt"`,
    [uid, typeStr, titleStr, bodyStr, JSON.stringify(p)],
  );
  return result.rows[0] || null;
}

async function listNotificationsForUser(userId, { limit = 30, beforeId = null }) {
  const uid = Number(userId);
  if (!Number.isFinite(uid) || uid <= 0) return [];

  const lim = Math.min(Math.max(Number(limit) || 30, 1), 100);
  const before = beforeId == null ? null : Number(beforeId);

  if (!isPostgresEnabled()) {
    let rows = memoryStore.notifications.filter((n) => Number(n.userId) === uid);
    if (Number.isFinite(before) && before > 0) {
      rows = rows.filter((n) => Number(n.id) < before);
    }
    rows.sort((a, b) => Number(b.id) - Number(a.id));
    return rows.slice(0, lim);
  }

  const result = await query(
    `SELECT
       id,
       user_id AS "userId",
       type,
       title,
       body,
       payload,
       read_at AS "readAt",
       created_at AS "createdAt"
     FROM notifications
     WHERE user_id = $1
       AND ($2::int IS NULL OR id < $2::int)
     ORDER BY id DESC
     LIMIT $3`,
    [uid, Number.isFinite(before) && before > 0 ? before : null, lim],
  );
  return result.rows;
}

async function unreadCountForUser(userId) {
  const uid = Number(userId);
  if (!Number.isFinite(uid) || uid <= 0) return 0;

  if (!isPostgresEnabled()) {
    return memoryStore.notifications.filter(
      (n) => Number(n.userId) === uid && n.readAt == null,
    ).length;
  }

  const result = await query(
    'SELECT COUNT(*)::int AS c FROM notifications WHERE user_id = $1 AND read_at IS NULL',
    [uid],
  );
  return result.rows[0]?.c ?? 0;
}

async function markNotificationRead(notificationId, userId) {
  const nid = Number(notificationId);
  const uid = Number(userId);
  if (!Number.isFinite(nid) || nid <= 0 || !Number.isFinite(uid) || uid <= 0) {
    return false;
  }

  const nowIso = new Date().toISOString();

  if (!isPostgresEnabled()) {
    const n = memoryStore.notifications.find((x) => Number(x.id) === nid);
    if (!n || Number(n.userId) !== uid) return false;
    n.readAt = nowIso;
    return true;
  }

  const result = await query(
    `UPDATE notifications
     SET read_at = COALESCE(read_at, NOW())
     WHERE id = $1 AND user_id = $2
     RETURNING id`,
    [nid, uid],
  );
  return result.rowCount > 0;
}

async function markAllNotificationsRead(userId) {
  const uid = Number(userId);
  if (!Number.isFinite(uid) || uid <= 0) return 0;

  const nowIso = new Date().toISOString();

  if (!isPostgresEnabled()) {
    let n = 0;
    for (const row of memoryStore.notifications) {
      if (Number(row.userId) === uid && row.readAt == null) {
        row.readAt = nowIso;
        n += 1;
      }
    }
    return n;
  }

  const result = await query(
    `UPDATE notifications
     SET read_at = NOW()
     WHERE user_id = $1 AND read_at IS NULL`,
    [uid],
  );
  return result.rowCount ?? 0;
}

async function upsertPushDevice(userId, fcmToken, platform) {
  const uid = Number(userId);
  if (!Number.isFinite(uid) || uid <= 0) return false;

  const token = String(fcmToken ?? '').trim();
  if (!token) return false;

  const plat = String(platform ?? '').trim().toLowerCase();
  if (!['android', 'ios', 'web'].includes(plat)) return false;

  if (!isPostgresEnabled()) {
    const existing = memoryStore.pushDevices.find(
      (d) => Number(d.userId) === uid && d.fcmToken === token,
    );
    if (existing) {
      existing.platform = plat;
      existing.updatedAt = new Date().toISOString();
    } else {
      memoryStore.pushDevices.push({
        userId: uid,
        fcmToken: token,
        platform: plat,
        updatedAt: new Date().toISOString(),
      });
    }
    return true;
  }

  await query(
    `INSERT INTO user_push_devices (user_id, fcm_token, platform, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (user_id, fcm_token)
     DO UPDATE SET platform = EXCLUDED.platform, updated_at = NOW()`,
    [uid, token, plat],
  );
  return true;
}

async function deletePushDevice(userId, fcmToken) {
  const uid = Number(userId);
  const token = String(fcmToken ?? '').trim();
  if (!Number.isFinite(uid) || uid <= 0 || !token) return false;

  if (!isPostgresEnabled()) {
    const before = memoryStore.pushDevices.length;
    memoryStore.pushDevices = memoryStore.pushDevices.filter(
      (d) => !(Number(d.userId) === uid && d.fcmToken === token),
    );
    return memoryStore.pushDevices.length < before;
  }

  const result = await query(
    'DELETE FROM user_push_devices WHERE user_id = $1 AND fcm_token = $2',
    [uid, token],
  );
  return result.rowCount > 0;
}

module.exports = {
  insertNotification,
  listNotificationsForUser,
  unreadCountForUser,
  markNotificationRead,
  markAllNotificationsRead,
  upsertPushDevice,
  deletePushDevice,
};
