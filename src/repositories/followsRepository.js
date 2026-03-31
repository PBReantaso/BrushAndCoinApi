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
    if (!exists) {
      memoryStore.follows.push({ followerId: ids.followerId, followedId: ids.followedId });
    }
    return;
  }

  await query(
    `INSERT INTO follows (follower_id, followed_id) VALUES ($1, $2)
     ON CONFLICT (follower_id, followed_id) DO NOTHING`,
    [ids.followerId, ids.followedId],
  );
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
};
