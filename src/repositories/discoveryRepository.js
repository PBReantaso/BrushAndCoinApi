const { isPostgresEnabled, query } = require('../config/database');
const { memoryStore } = require('../data/memoryStore');
const authRepository = require('./authRepository');

function _toNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function _safeLimit(raw, fallback = 30, max = 100) {
  const n = Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(max, n);
}

function _normalizeCategory(raw) {
  const v = String(raw ?? '').trim();
  return v ? v.toLowerCase() : '';
}

function _normalizeSort(raw) {
  const s = String(raw ?? 'relevance').trim().toLowerCase();
  if (new Set(['relevance', 'newest', 'priceasc', 'pricedesc']).has(s)) return s;
  return 'relevance';
}

function _tagsContains(tags, token) {
  const t = String(token || '').toLowerCase();
  return Array.isArray(tags) && tags.some((x) => String(x).toLowerCase().includes(t));
}

function _scorePost(post, q, viewerId, followsSet) {
  const queryStr = String(q || '').trim().toLowerCase();
  if (!queryStr) return 1;
  let score = 0;
  const title = String(post.title || '').toLowerCase();
  const desc = String(post.description || '').toLowerCase();
  const author = String(post.authorName || '').toLowerCase();
  if (title === queryStr) score += 10;
  else if (title.includes(queryStr)) score += 6;
  if (desc.includes(queryStr)) score += 3;
  if (author.includes(queryStr)) score += 2;
  if (_tagsContains(post.tags, queryStr)) score += 4;
  if (followsSet.has(Number(post.userId))) score += 2;
  if (Number(post.userId) === Number(viewerId)) score -= 1;
  return score;
}

async function searchPostsForDiscovery(viewerUserId, rawFilters = {}) {
  const viewerId = Number(viewerUserId);
  if (!Number.isFinite(viewerId) || viewerId <= 0) return [];

  const q = String(rawFilters.q ?? '').trim();
  const category = _normalizeCategory(rawFilters.category);
  const commissionOnly = rawFilters.commissionOnly === true || rawFilters.commissionOnly === 'true';
  const minPrice = _toNum(rawFilters.minPrice, 0);
  const maxPrice = _toNum(rawFilters.maxPrice, Number.MAX_SAFE_INTEGER);
  const limit = _safeLimit(rawFilters.limit, 30, 100);
  const sort = _normalizeSort(rawFilters.sort);

  if (!isPostgresEnabled()) {
    const follows = new Set(
      memoryStore.follows
        .filter((f) => Number(f.followerId) === viewerId)
        .map((f) => Number(f.followedId)),
    );
    const rows = memoryStore.posts
      .map((p) => {
        const author = memoryStore.users.find((u) => Number(u.id) === Number(p.userId));
        const privateAuthor = Boolean(author?.isPrivate);
        const visible =
          Number(p.userId) === viewerId ||
          !privateAuthor ||
          follows.has(Number(p.userId));
        if (!visible) return null;
        const score = _scorePost(
          {
            ...p,
            authorName: p.authorName ?? author?.username ?? '',
          },
          q,
          viewerId,
          follows,
        );
        return {
          ...p,
          authorName: p.authorName ?? author?.username ?? '',
          authorAvatarUrl: author?.avatarUrl ?? null,
          likeCount: memoryStore.postLikes.filter((l) => Number(l.postId) === Number(p.id)).length,
          commentCount: memoryStore.postComments.filter((c) => Number(c.postId) === Number(p.id)).length,
          _score: score,
        };
      })
      .filter(Boolean)
      .filter((p) => {
        if (q) {
          const n = String(q).toLowerCase();
          const hay = `${p.title} ${p.description} ${p.authorName}`.toLowerCase();
          if (!hay.includes(n) && !_tagsContains(p.tags, n)) return false;
        }
        if (category && String(p.category || '').toLowerCase() !== category) return false;
        if (commissionOnly && !Boolean(p.isCommissionAvailable)) return false;
        const price = _toNum(p.price, 0);
        if (price < minPrice || price > maxPrice) return false;
        return true;
      });

    const sorted = [...rows].sort((a, b) => {
      if (sort === 'newest') return String(b.createdAt).localeCompare(String(a.createdAt));
      if (sort === 'priceasc') return _toNum(a.price) - _toNum(b.price);
      if (sort === 'pricedesc') return _toNum(b.price) - _toNum(a.price);
      return _toNum(b._score) - _toNum(a._score) || String(b.createdAt).localeCompare(String(a.createdAt));
    });
    return sorted.slice(0, limit).map(({ _score, ...rest }) => rest);
  }

  const params = [viewerId];
  let where = `
    (
      p.user_id = $1
      OR COALESCE(u.is_private, FALSE) = FALSE
      OR EXISTS (
        SELECT 1 FROM follows f
        WHERE f.follower_id = $1 AND f.followed_id = p.user_id
      )
    )`;

  if (q) {
    params.push(`%${q}%`);
    const p = `$${params.length}`;
    where += ` AND (
      p.title ILIKE ${p}
      OR p.description ILIKE ${p}
      OR COALESCE(NULLIF(u.username, ''), split_part(u.email, '@', 1)) ILIKE ${p}
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(p.tags) t
        WHERE t ILIKE ${p}
      )
    )`;
  }
  if (category) {
    params.push(category);
    where += ` AND LOWER(COALESCE(p.category, '')) = $${params.length}`;
  }
  if (commissionOnly) {
    where += ' AND p.is_commission_available = TRUE';
  }
  params.push(minPrice);
  where += ` AND p.price >= $${params.length}`;
  params.push(maxPrice);
  where += ` AND p.price <= $${params.length}`;

  let order = 'p.created_at DESC';
  if (sort === 'priceasc') order = 'p.price ASC, p.created_at DESC';
  else if (sort === 'pricedesc') order = 'p.price DESC, p.created_at DESC';
  else if (sort === 'relevance' && q) {
    params.push(`%${q}%`);
    const qq = `$${params.length}`;
    order = `
      (
        CASE WHEN p.title ILIKE ${qq} THEN 6 ELSE 0 END +
        CASE WHEN p.description ILIKE ${qq} THEN 3 ELSE 0 END +
        CASE WHEN EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(p.tags) t WHERE t ILIKE ${qq}
        ) THEN 4 ELSE 0 END +
        CASE WHEN EXISTS (
          SELECT 1 FROM follows f WHERE f.follower_id = $1 AND f.followed_id = p.user_id
        ) THEN 2 ELSE 0 END
      ) DESC,
      p.created_at DESC`;
  }

  params.push(limit);
  const limitRef = `$${params.length}`;
  const result = await query(
    `SELECT
      p.id,
      p.user_id AS "userId",
      COALESCE(NULLIF(u.username, ''), split_part(u.email, '@', 1)) AS "authorName",
      u.avatar_url AS "authorAvatarUrl",
      p.title,
      p.description,
      p.category,
      p.price,
      p.is_commission_available AS "isCommissionAvailable",
      p.tags,
      p.image_url AS "imageUrl",
      p.created_at AS "createdAt",
      p.edited_at AS "editedAt",
      COALESCE(lc.like_count, 0)::int AS "likeCount",
      COALESCE(cc.comment_count, 0)::int AS "commentCount",
      EXISTS(
        SELECT 1 FROM post_likes pl
        WHERE pl.post_id = p.id AND pl.user_id = $1
      ) AS "likedByMe"
    FROM posts p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN (
      SELECT post_id, COUNT(*) AS like_count FROM post_likes GROUP BY post_id
    ) lc ON lc.post_id = p.id
    LEFT JOIN (
      SELECT post_id, COUNT(*) AS comment_count FROM post_comments GROUP BY post_id
    ) cc ON cc.post_id = p.id
    WHERE ${where}
    ORDER BY ${order}
    LIMIT ${limitRef}`,
    params,
  );
  return result.rows;
}

async function getDiscoveryRecommendations(viewerUserId, { limitUsers = 8, limitTags = 12 } = {}) {
  const uid = Number(viewerUserId);
  if (!Number.isFinite(uid) || uid <= 0) return { users: [], tags: [] };
  const limUsers = _safeLimit(limitUsers, 8, 30);
  const limTags = _safeLimit(limitTags, 12, 40);

  const users = await authRepository.searchUsersByQuery('', {
    excludeUserId: uid,
    limit: limUsers,
  });

  if (!isPostgresEnabled()) {
    const follows = new Set(
      memoryStore.follows
        .filter((f) => Number(f.followerId) === uid)
        .map((f) => Number(f.followedId)),
    );
    const tagCounts = new Map();
    for (const p of memoryStore.posts) {
      if (!follows.has(Number(p.userId))) continue;
      for (const t of p.tags || []) {
        const key = String(t).trim().toLowerCase();
        if (!key) continue;
        tagCounts.set(key, (tagCounts.get(key) ?? 0) + 1);
      }
    }
    const tags = [...tagCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limTags)
      .map(([tag, count]) => ({ tag, score: count }));
    return { users, tags };
  }

  const tagsResult = await query(
    `WITH followed_posts AS (
      SELECT p.tags
      FROM posts p
      WHERE EXISTS (
        SELECT 1 FROM follows f
        WHERE f.follower_id = $1 AND f.followed_id = p.user_id
      )
      ORDER BY p.created_at DESC
      LIMIT 400
    ),
    expanded AS (
      SELECT LOWER(TRIM(value::text, '"')) AS tag
      FROM followed_posts fp, jsonb_array_elements(fp.tags)
    )
    SELECT tag, COUNT(*)::int AS score
    FROM expanded
    WHERE tag <> ''
    GROUP BY tag
    ORDER BY score DESC, tag ASC
    LIMIT $2`,
    [uid, limTags],
  );
  return { users, tags: tagsResult.rows };
}

async function listSavedSearches(userId, limit = 50) {
  const uid = Number(userId);
  const lim = _safeLimit(limit, 50, 200);
  if (!Number.isFinite(uid) || uid <= 0) return [];

  if (!isPostgresEnabled()) {
    return memoryStore.savedSearches
      .filter((s) => Number(s.userId) === uid)
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      .slice(0, lim);
  }

  const result = await query(
    `SELECT
      id, user_id AS "userId", name, query, filters,
      created_at AS "createdAt", updated_at AS "updatedAt"
     FROM user_saved_searches
     WHERE user_id = $1
     ORDER BY updated_at DESC
     LIMIT $2`,
    [uid, lim],
  );
  return result.rows;
}

async function createSavedSearch(userId, { name, query: q, filters }) {
  const uid = Number(userId);
  const label = String(name ?? '').trim().slice(0, 120);
  const queryText = String(q ?? '').trim().slice(0, 240);
  const f = filters && typeof filters === 'object' ? filters : {};
  if (!Number.isFinite(uid) || uid <= 0 || !label) return null;

  if (!isPostgresEnabled()) {
    const nextId = (memoryStore.savedSearches.at(-1)?.id ?? 0) + 1;
    const now = new Date().toISOString();
    const row = {
      id: nextId,
      userId: uid,
      name: label,
      query: queryText,
      filters: { ...f },
      createdAt: now,
      updatedAt: now,
    };
    memoryStore.savedSearches.push(row);
    return row;
  }

  const result = await query(
    `INSERT INTO user_saved_searches (user_id, name, query, filters)
     VALUES ($1, $2, $3, $4::jsonb)
     RETURNING
       id, user_id AS "userId", name, query, filters,
       created_at AS "createdAt", updated_at AS "updatedAt"`,
    [uid, label, queryText, f],
  );
  return result.rows[0] || null;
}

async function deleteSavedSearch(userId, savedSearchId) {
  const uid = Number(userId);
  const sid = Number(savedSearchId);
  if (!Number.isFinite(uid) || uid <= 0 || !Number.isFinite(sid) || sid <= 0) return false;
  if (!isPostgresEnabled()) {
    const idx = memoryStore.savedSearches.findIndex(
      (s) => Number(s.id) === sid && Number(s.userId) === uid,
    );
    if (idx < 0) return false;
    memoryStore.savedSearches.splice(idx, 1);
    return true;
  }
  const result = await query(
    'DELETE FROM user_saved_searches WHERE id = $1 AND user_id = $2',
    [sid, uid],
  );
  return result.rowCount > 0;
}

module.exports = {
  searchPostsForDiscovery,
  getDiscoveryRecommendations,
  listSavedSearches,
  createSavedSearch,
  deleteSavedSearch,
};

