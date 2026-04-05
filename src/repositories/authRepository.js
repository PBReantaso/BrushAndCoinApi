const { isPostgresEnabled, query } = require('../config/database');
const { memoryStore } = require('../data/memoryStore');

function defaultSocialLinks() {
  return { facebook: '', instagram: '', twitter: '', website: '' };
}

function normalizeUserSocialLinks(raw) {
  const d = defaultSocialLinks();
  if (!raw || typeof raw !== 'object') {
    return d;
  }
  return {
    facebook: String(raw.facebook ?? '').trim(),
    instagram: String(raw.instagram ?? '').trim(),
    twitter: String(raw.twitter ?? '').trim(),
    website: String(raw.website ?? '').trim(),
  };
}

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
    `SELECT id, email, username, password_hash AS password,
            COALESCE(is_private, FALSE) AS "isPrivate",
            COALESCE(first_name, '') AS "firstName",
            COALESCE(last_name, '') AS "lastName",
            avatar_url AS "avatarUrl"
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
    const user = {
      id: nextId,
      email,
      username,
      password,
      isPrivate: false,
      firstName: '',
      lastName: '',
      avatarUrl: null,
      socialLinks: defaultSocialLinks(),
      tipsEnabled: false,
      tipsUrl: null,
    };
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
    const u = memoryStore.users.find((user) => user.id === id) || null;
    if (!u) return null;
    if (u.isPrivate === undefined) u.isPrivate = false;
    if (u.firstName === undefined) u.firstName = '';
    if (u.lastName === undefined) u.lastName = '';
    if (u.avatarUrl === undefined) u.avatarUrl = null;
    u.socialLinks = normalizeUserSocialLinks(u.socialLinks);
    if (u.tipsEnabled === undefined) u.tipsEnabled = false;
    if (u.tipsUrl === undefined) u.tipsUrl = null;
    return u;
  }

  const result = await query(
    `SELECT id, email, username, password_hash AS password,
            COALESCE(is_private, FALSE) AS "isPrivate",
            COALESCE(first_name, '') AS "firstName",
            COALESCE(last_name, '') AS "lastName",
            avatar_url AS "avatarUrl",
            COALESCE(social_links, '{"facebook":"","instagram":"","twitter":"","website":""}'::jsonb) AS "socialLinks",
            COALESCE(tips_enabled, FALSE) AS "tipsEnabled",
            tips_url AS "tipsUrl"
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [id],
  );
  const row = result.rows[0];
  if (row && row.socialLinks) {
    row.socialLinks = normalizeUserSocialLinks(row.socialLinks);
  }
  return row || null;
}

async function isUserPrivate(userId) {
  const uid = Number(userId);
  if (!Number.isFinite(uid) || uid <= 0) {
    return false;
  }
  if (!isPostgresEnabled()) {
    const u = memoryStore.users.find((x) => Number(x.id) === uid);
    if (!u) return false;
    if (u.isPrivate === undefined) u.isPrivate = false;
    return Boolean(u.isPrivate);
  }
  const result = await query(
    'SELECT COALESCE(is_private, FALSE) AS p FROM users WHERE id = $1 LIMIT 1',
    [uid],
  );
  return Boolean(result.rows[0]?.p);
}

async function updateUserProfileById(id, {
  username,
  isPrivate,
  firstName,
  lastName,
  avatarUrl,
  socialLinks,
  tipsEnabled,
  tipsUrl,
}) {
  const hasUsername =
    username !== undefined && username !== null && String(username).trim() !== '';
  const hasPrivate = typeof isPrivate === 'boolean';
  const hasFirstName = firstName !== undefined;
  const hasLastName = lastName !== undefined;
  const hasAvatarUrl = avatarUrl !== undefined;
  const hasSocialLinks = socialLinks !== undefined;
  const hasTipsEnabled = typeof tipsEnabled === 'boolean';
  const hasTipsUrl = tipsUrl !== undefined;

  if (
    !hasUsername &&
    !hasPrivate &&
    !hasFirstName &&
    !hasLastName &&
    !hasAvatarUrl &&
    !hasSocialLinks &&
    !hasTipsEnabled &&
    !hasTipsUrl
  ) {
    const err = new Error('No profile fields to update.');
    err.statusCode = 400;
    throw err;
  }

  if (!isPostgresEnabled()) {
    const user = memoryStore.users.find((entry) => entry.id === id);
    if (!user) return null;
    if (hasUsername) {
      const u = String(username).trim();
      const taken = await findUserIdByUsernameKey(u, id);
      if (taken) {
        const err = new Error('Username is already taken.');
        err.statusCode = 409;
        throw err;
      }
      user.username = u;
    }
    if (hasPrivate) {
      user.isPrivate = isPrivate;
    }
    if (hasFirstName) {
      user.firstName = String(firstName).trim();
    }
    if (hasLastName) {
      user.lastName = String(lastName).trim();
    }
    if (hasAvatarUrl) {
      const v = avatarUrl;
      user.avatarUrl = v === null || v === '' ? null : String(v);
    }
    if (hasSocialLinks) {
      user.socialLinks = normalizeUserSocialLinks(socialLinks);
    }
    if (hasTipsEnabled) {
      user.tipsEnabled = tipsEnabled;
    }
    if (hasTipsUrl) {
      const v = tipsUrl;
      user.tipsUrl = v === null || v === '' ? null : String(v).trim();
    }
    if (user.isPrivate === undefined) user.isPrivate = false;
    if (user.firstName === undefined) user.firstName = '';
    if (user.lastName === undefined) user.lastName = '';
    if (user.socialLinks === undefined) user.socialLinks = defaultSocialLinks();
    if (user.tipsEnabled === undefined) user.tipsEnabled = false;
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      isPrivate: Boolean(user.isPrivate),
      firstName: user.firstName ?? '',
      lastName: user.lastName ?? '',
      avatarUrl: user.avatarUrl ?? null,
      socialLinks: normalizeUserSocialLinks(user.socialLinks),
      tipsEnabled: Boolean(user.tipsEnabled),
      tipsUrl: user.tipsUrl ?? null,
    };
  }

  const parts = [];
  const vals = [];
  let i = 1;
  if (hasUsername) {
    parts.push(`username = $${i++}`);
    vals.push(String(username).trim());
  }
  if (hasPrivate) {
    parts.push(`is_private = $${i++}`);
    vals.push(isPrivate);
  }
  if (hasFirstName) {
    parts.push(`first_name = $${i++}`);
    vals.push(String(firstName).trim());
  }
  if (hasLastName) {
    parts.push(`last_name = $${i++}`);
    vals.push(String(lastName).trim());
  }
  if (hasAvatarUrl) {
    parts.push(`avatar_url = $${i++}`);
    const v = avatarUrl;
    vals.push(v === null || v === '' ? null : String(v));
  }
  if (hasSocialLinks) {
    parts.push(`social_links = $${i++}::jsonb`);
    vals.push(normalizeUserSocialLinks(socialLinks));
  }
  if (hasTipsEnabled) {
    parts.push(`tips_enabled = $${i++}`);
    vals.push(tipsEnabled);
  }
  if (hasTipsUrl) {
    parts.push(`tips_url = $${i++}`);
    const v = tipsUrl;
    vals.push(v === null || v === '' ? null : String(v).trim());
  }
  vals.push(id);

  try {
    const result = await query(
      `UPDATE users SET ${parts.join(', ')}
       WHERE id = $${i}
       RETURNING id, email, username,
         COALESCE(is_private, FALSE) AS "isPrivate",
         COALESCE(first_name, '') AS "firstName",
         COALESCE(last_name, '') AS "lastName",
         avatar_url AS "avatarUrl",
         COALESCE(social_links, '{"facebook":"","instagram":"","twitter":"","website":""}'::jsonb) AS "socialLinks",
         COALESCE(tips_enabled, FALSE) AS "tipsEnabled",
         tips_url AS "tipsUrl"`,
      vals,
    );
    const row = result.rows[0];
    if (row && row.socialLinks) {
      row.socialLinks = normalizeUserSocialLinks(row.socialLinks);
    }
    return row || null;
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
      .filter((u) => {
        if (u.isPrivate === undefined) u.isPrivate = false;
        if (!u.isPrivate) return true;
        return memoryStore.follows.some(
          (f) => Number(f.followerId) === exclude && Number(f.followedId) === Number(u.id),
        );
      })
      .map((u) => ({
        id: u.id,
        username: u.username || String(u.email || 'user').split('@')[0],
        avatarUrl: u.avatarUrl ?? null,
      }))
      .filter((u) => String(u.username).toLowerCase().includes(needle))
      .sort((a, b) => String(a.username).localeCompare(String(b.username)))
      .slice(0, lim);
  }

  const pattern = `%${q}%`;
  const result = await query(
    `SELECT u.id,
            COALESCE(NULLIF(u.username, ''), split_part(u.email, '@', 1)) AS username,
            u.avatar_url AS "avatarUrl"
     FROM users u
     WHERE u.id <> $1
       AND (
         COALESCE(NULLIF(u.username, ''), '') ILIKE $2
         OR split_part(u.email, '@', 1) ILIKE $2
       )
       AND (
         COALESCE(u.is_private, FALSE) = FALSE
         OR EXISTS (
           SELECT 1 FROM follows f
           WHERE f.follower_id = $1 AND f.followed_id = u.id
         )
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
  if (user.isPrivate === undefined) user.isPrivate = false;
  return {
    id: user.id,
    username: user.username || String(user.email || 'user').split('@')[0],
    isPrivate: Boolean(user.isPrivate),
    firstName: user.firstName ?? '',
    lastName: user.lastName ?? '',
    avatarUrl: user.avatarUrl ?? null,
    socialLinks: normalizeUserSocialLinks(user.socialLinks),
    tipsEnabled: Boolean(user.tipsEnabled),
    tipsUrl: user.tipsUrl ?? null,
  };
}

/**
 * Resolve @mention handles to user ids (case-insensitive username match).
 * @param {string[]} handles
 * @param {number} excludeUserId
 * @returns {Promise<number[]>}
 */
async function findUserIdsForMentionHandles(handles, excludeUserId = 0) {
  const keys = [
    ...new Set(
      handles
        .map((h) => normalizeUsernameKey(h))
        .filter((k) => k && k.length >= 2),
    ),
  ];
  if (!keys.length) {
    return [];
  }
  const exclude = Number(excludeUserId) || 0;

  if (!isPostgresEnabled()) {
    const out = new Set();
    for (const key of keys) {
      const foundId = await findUserIdByUsernameKey(key, exclude);
      if (foundId != null) {
        out.add(Number(foundId));
      }
    }
    return [...out];
  }

  const result = await query(
    `SELECT DISTINCT id FROM users
     WHERE id <> $2
       AND (
         (TRIM(COALESCE(username, '')) <> '' AND LOWER(TRIM(username)) = ANY($1::text[]))
         OR LOWER(split_part(email, '@', 1)) = ANY($1::text[])
       )`,
    [keys, exclude],
  );
  return result.rows.map((r) => Number(r.id));
}

async function listAllUserIds() {
  if (!isPostgresEnabled()) {
    return memoryStore.users.map((u) => Number(u.id)).filter((id) => id > 0);
  }
  const result = await query('SELECT id FROM users ORDER BY id ASC');
  return result.rows.map((r) => Number(r.id));
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
  findUserIdsForMentionHandles,
  listAllUserIds,
  isUserPrivate,
};
