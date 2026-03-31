const { isPostgresEnabled, query } = require('../config/database');
const { memoryStore } = require('../data/memoryStore');

function normalizeUsernameKey(username) {
  return String(username ?? '').trim().toLowerCase();
}

/**
 * @returns {Promise<number|null>} Another user's id if `username` is already taken (case-insensitive), else null.
 */
async function findUserIdByUsernameKey(username, excludeUserId = 0) {
  const key = normalizeUsernameKey(username);
  if (!key) {
    return null;
  }
  const exclude = Number(excludeUserId) || 0;

  if (!isPostgresEnabled()) {
    for (const u of memoryStore.users) {
      if (Number(u.id) === exclude) {
        continue;
      }
      const cand =
        u.username && String(u.username).trim() !== ''
          ? u.username
          : String(u.email || 'user').split('@')[0];
      if (normalizeUsernameKey(cand) === key) {
        return u.id;
      }
    }
    return null;
  }

  const result = await query(
    `SELECT id FROM users
     WHERE id <> $2
       AND TRIM(COALESCE(username, '')) <> ''
       AND LOWER(TRIM(username)) = $1
     LIMIT 1`,
    [key, exclude],
  );
  return result.rows[0]?.id ?? null;
}

async function findUserByEmail(email) {
  if (!isPostgresEnabled()) {
    return (
      memoryStore.users.find(
        (user) => user.email.toLowerCase() === String(email).toLowerCase(),
      ) || null
    );
  }

  const result = await query(
    `SELECT id, email, username, password_hash AS password
     FROM users
     WHERE LOWER(email) = LOWER($1)
     LIMIT 1`,
    [email],
  );
  return result.rows[0] || null;
}

async function createUser({ email, password, username }) {
  if (!isPostgresEnabled()) {
    const taken = await findUserIdByUsernameKey(username, 0);
    if (taken) {
      const err = new Error('Username is already taken.');
      err.statusCode = 409;
      throw err;
    }
    const nextId = memoryStore.users.length + 1;
    const user = { id: nextId, email, username, password };
    memoryStore.users.push(user);
    return user;
  }

  try {
    const result = await query(
      'INSERT INTO users (email, username, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, email, username',
      [email, username, password, 'patron'],
    );
    return result.rows[0];
  } catch (e) {
    if (e && e.code === '23505') {
      const err = new Error('Username is already taken.');
      err.statusCode = 409;
      throw err;
    }
    throw e;
  }
}

async function findUserById(id) {
  if (!isPostgresEnabled()) {
    return memoryStore.users.find((user) => user.id === id) || null;
  }

  const result = await query(
    `SELECT id, email, username, password_hash AS password
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [id],
  );
  return result.rows[0] || null;
}

async function updateUserProfileById(id, { username }) {
  if (!isPostgresEnabled()) {
    const user = memoryStore.users.find((entry) => entry.id === id);
    if (!user) return null;
    const taken = await findUserIdByUsernameKey(username, id);
    if (taken) {
      const err = new Error('Username is already taken.');
      err.statusCode = 409;
      throw err;
    }
    user.username = username;
    return { id: user.id, email: user.email, username: user.username };
  }

  try {
    const result = await query(
      `UPDATE users
       SET username = $2
       WHERE id = $1
       RETURNING id, email, username`,
      [id, username],
    );
    return result.rows[0] || null;
  } catch (e) {
    if (e && e.code === '23505') {
      const err = new Error('Username is already taken.');
      err.statusCode = 409;
      throw err;
    }
    throw e;
  }
}

function _sanitizeSearchQuery(raw) {
  return String(raw ?? '')
    .trim()
    .replace(/%/g, '')
    .replace(/_/g, '')
    .slice(0, 48);
}

async function searchUsersByQuery(rawQuery, { excludeUserId, limit = 24 }) {
  const q = _sanitizeSearchQuery(rawQuery);
  if (!q) {
    return [];
  }
  const lim = Math.min(Math.max(Number(limit) || 24, 1), 50);
  const exclude = Number(excludeUserId);

  if (!isPostgresEnabled()) {
    const needle = q.toLowerCase();
    return memoryStore.users
      .filter((u) => Number(u.id) !== exclude)
      .map((u) => ({
        id: u.id,
        username: u.username || String(u.email || 'user').split('@')[0],
      }))
      .filter((u) => String(u.username).toLowerCase().includes(needle))
      .sort((a, b) => String(a.username).localeCompare(String(b.username)))
      .slice(0, lim);
  }

  const pattern = `%${q}%`;
  const result = await query(
    `SELECT id,
            COALESCE(NULLIF(username, ''), split_part(email, '@', 1)) AS username
     FROM users
     WHERE id <> $1
       AND (
         COALESCE(NULLIF(username, ''), '') ILIKE $2
         OR split_part(email, '@', 1) ILIKE $2
       )
     ORDER BY username ASC
     LIMIT $3`,
    [exclude, pattern, lim],
  );
  return result.rows;
}

async function findPublicUserById(id) {
  const user = await findUserById(id);
  if (!user) {
    return null;
  }
  return {
    id: user.id,
    username: user.username || String(user.email || 'user').split('@')[0],
  };
}

async function deleteUserById(id) {
  if (!isPostgresEnabled()) {
    const index = memoryStore.users.findIndex((user) => user.id === id);
    if (index !== -1) {
      memoryStore.users.splice(index, 1);
    }
    return;
  }

  await query('DELETE FROM users WHERE id = $1', [id]);
}

module.exports = {
  findUserByEmail,
  createUser,
  findUserById,
  updateUserProfileById,
  deleteUserById,
  searchUsersByQuery,
  findPublicUserById,
  findUserIdByUsernameKey,
};
