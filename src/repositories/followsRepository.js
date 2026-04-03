const { isPostgresEnabled, query } = require('../config/database');
const { memoryStore } = require('../data/memoryStore');

function _normalizeIds(followerId, followedId) {
  const a = Number(followerId);
  const b = Number(followedId);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0 || a === b) {
    return null;
  }
  return { followerId: a, followedId: b };
}

async function followerCount(userId) {
  const id = Number(userId);
  if (!Number.isFinite(id) || id <= 0) return 0;

  if (!isPostgresEnabled()) {
    return memoryStore.follows.filter((f) => Number(f.followedId) === id).length;
  }

  const result = await query(
    'SELECT COUNT(*)::int AS c FROM follows WHERE followed_id = $1',
    [id],
  );
  return result.rows[0]?.c ?? 0;
}

async function followingCount(userId) {
  const id = Number(userId);
  if (!Number.isFinite(id) || id <= 0) return 0;

  if (!isPostgresEnabled()) {
    return memoryStore.follows.filter((f) => Number(f.followerId) === id).length;
  }

  const result = await query(
    'SELECT COUNT(*)::int AS c FROM follows WHERE follower_id = $1',
    [id],
  );
  return result.rows[0]?.c ?? 0;
}

async function isFollowing(followerId, followedId) {
  const ids = _normalizeIds(followerId, followedId);
  if (!ids) return false;

  if (!isPostgresEnabled()) {
    return memoryStore.follows.some(
      (f) => Number(f.followerId) === ids.followerId && Number(f.followedId) === ids.followedId,
    );
  }

  const result = await query(
    'SELECT 1 FROM follows WHERE follower_id = $1 AND followed_id = $2 LIMIT 1',
    [ids.followerId, ids.followedId],
  );
  return result.rowCount > 0;
}

async function follow(followerId, followedId) {
  const ids = _normalizeIds(followerId, followedId);
  if (!ids) {
    const err = new Error('Invalid follow pair.');
    err.statusCode = 400;
    throw err;
  }

  if (!isPostgresEnabled()) {
    const exists = memoryStore.follows.some(
      (f) => Number(f.followerId) === ids.followerId && Number(f.followedId) === ids.followedId,
    );
    if (exists) {
      return false;
    }
    memoryStore.follows.push({ followerId: ids.followerId, followedId: ids.followedId });
    return true;
  }

  const result = await query(
    `INSERT INTO follows (follower_id, followed_id) VALUES ($1, $2)
     ON CONFLICT (follower_id, followed_id) DO NOTHING
     RETURNING follower_id`,
    [ids.followerId, ids.followedId],
  );
  return result.rowCount > 0;
}

async function listFollowers(profileUserId) {
  const id = Number(profileUserId);
  if (!Number.isFinite(id) || id <= 0) {
    return [];
  }

  if (!isPostgresEnabled()) {
    const followerIds = memoryStore.follows
      .filter((f) => Number(f.followedId) === id)
      .map((f) => Number(f.followerId));
    const out = [];
    for (const fid of followerIds) {
      const u = memoryStore.users.find((x) => Number(x.id) === fid);
      if (u) {
        out.push({
          id: u.id,
          username: u.username || String(u.email || 'user').split('@')[0],
        });
      }
    }
    out.sort((a, b) => String(a.username).localeCompare(String(b.username)));
    return out;
  }

  const result = await query(
    `SELECT u.id,
            COALESCE(NULLIF(TRIM(u.username), ''), split_part(u.email, '@', 1)) AS username
     FROM follows f
     INNER JOIN users u ON u.id = f.follower_id
     WHERE f.followed_id = $1
     ORDER BY username ASC`,
    [id],
  );
  return result.rows;
}

async function listFollowing(profileUserId) {
  const id = Number(profileUserId);
  if (!Number.isFinite(id) || id <= 0) {
    return [];
  }

  if (!isPostgresEnabled()) {
    const followedIds = memoryStore.follows
      .filter((f) => Number(f.followerId) === id)
      .map((f) => Number(f.followedId));
    const out = [];
    for (const fid of followedIds) {
      const u = memoryStore.users.find((x) => Number(x.id) === fid);
      if (u) {
        out.push({
          id: u.id,
          username: u.username || String(u.email || 'user').split('@')[0],
        });
      }
    }
    out.sort((a, b) => String(a.username).localeCompare(String(b.username)));
    return out;
  }

  const result = await query(
    `SELECT u.id,
            COALESCE(NULLIF(TRIM(u.username), ''), split_part(u.email, '@', 1)) AS username
     FROM follows f
     INNER JOIN users u ON u.id = f.followed_id
     WHERE f.follower_id = $1
     ORDER BY username ASC`,
    [id],
  );
  return result.rows;
}

async function listFollowerUserIds(followedId) {
  const id = Number(followedId);
  if (!Number.isFinite(id) || id <= 0) {
    return [];
  }

  if (!isPostgresEnabled()) {
    return memoryStore.follows
      .filter((f) => Number(f.followedId) === id)
      .map((f) => Number(f.followerId));
  }

  const result = await query(
    'SELECT follower_id AS id FROM follows WHERE followed_id = $1',
    [id],
  );
  return result.rows.map((r) => Number(r.id));
}

async function unfollow(followerId, followedId) {
  const ids = _normalizeIds(followerId, followedId);
  if (!ids) {
    const err = new Error('Invalid follow pair.');
    err.statusCode = 400;
    throw err;
  }

  if (!isPostgresEnabled()) {
    memoryStore.follows = memoryStore.follows.filter(
      (f) =>
        !(
          Number(f.followerId) === ids.followerId && Number(f.followedId) === ids.followedId
        ),
    );
    return;
  }

  await query('DELETE FROM follows WHERE follower_id = $1 AND followed_id = $2', [
    ids.followerId,
    ids.followedId,
  ]);
}

module.exports = {
  followerCount,
  followingCount,
  isFollowing,
  follow,
  unfollow,
  listFollowers,
  listFollowing,
  listFollowerUserIds,
};
