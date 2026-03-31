const { isPostgresEnabled, query } = require('../config/database');
const { memoryStore } = require('../data/memoryStore');

async function listArtists() {
  if (!isPostgresEnabled()) {
    return memoryStore.artists;
  }

  const result = await query(
    'SELECT id, name, location, rating FROM artists ORDER BY id ASC',
  );
  return result.rows;
}

async function listProjects() {
  if (!isPostgresEnabled()) {
    return memoryStore.projects;
  }

  const result = await query(
    `SELECT 
      p.id,
      p.title,
      p.client_name AS "clientName",
      p.status,
      pm.title AS milestone_title,
      pm.amount AS milestone_amount,
      pm.is_released AS milestone_released
    FROM projects p
    LEFT JOIN project_milestones pm ON pm.project_id = p.id
    ORDER BY p.id ASC, pm.id ASC`,
  );

  const projectMap = new Map();
  for (const row of result.rows) {
    if (!projectMap.has(row.id)) {
      projectMap.set(row.id, {
        id: row.id,
        title: row.title,
        clientName: row.clientName,
        status: row.status,
        milestones: [],
      });
    }

    if (row.milestone_title) {
      projectMap.get(row.id).milestones.push({
        title: row.milestone_title,
        amount: Number(row.milestone_amount),
        isReleased: row.milestone_released,
      });
    }
  }

  return Array.from(projectMap.values());
}

async function listConversations() {
  if (!isPostgresEnabled()) {
    return memoryStore.conversations;
  }

  const result = await query(
    'SELECT id, name FROM conversations ORDER BY id ASC',
  );
  return result.rows;
}

async function listEvents() {
  if (!isPostgresEnabled()) {
    return memoryStore.events;
  }

  const result = await query(
    `SELECT
      id,
      title,
      category,
      to_char(event_date, 'YYYY-MM-DD') AS "eventDate",
      to_char(event_time, 'HH24:MI') AS "eventTime",
      venue,
      location_text AS "locationText",
      latitude,
      longitude,
      description,
      additional_info AS "additionalInfo",
      image_url AS "imageUrl",
      schedules,
      created_by AS "createdBy",
      created_at AS "createdAt"
    FROM events
    ORDER BY event_date ASC, event_time ASC, id DESC`,
  );
  return result.rows;
}

async function createEvent({
  title,
  category,
  eventDate,
  eventTime,
  venue,
  locationText,
  latitude,
  longitude,
  description,
  additionalInfo,
  imageUrl,
  schedules,
  createdBy,
}) {
  if (!isPostgresEnabled()) {
    const nextId = (memoryStore.events.at(-1)?.id ?? 0) + 1;
    const event = {
      id: nextId,
      title,
      category,
      eventDate,
      eventTime,
      venue,
      locationText,
      latitude,
      longitude,
      description,
      additionalInfo,
      imageUrl: imageUrl ?? null,
      schedules,
      createdBy,
      createdAt: new Date().toISOString(),
    };
    memoryStore.events.push(event);
    return event;
  }

  const result = await query(
    `INSERT INTO events (
      title, category, event_date, event_time, venue, location_text,
      latitude, longitude, description, additional_info, image_url, schedules, created_by
    ) VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, $8, $9, $10, $11, $12::jsonb, $13
    )
    RETURNING
      id,
      title,
      category,
      to_char(event_date, 'YYYY-MM-DD') AS "eventDate",
      to_char(event_time, 'HH24:MI') AS "eventTime",
      venue,
      location_text AS "locationText",
      latitude,
      longitude,
      description,
      additional_info AS "additionalInfo",
      image_url AS "imageUrl",
      schedules,
      created_by AS "createdBy",
      created_at AS "createdAt"`,
    [
      title,
      category,
      eventDate,
      eventTime,
      venue,
      locationText,
      latitude,
      longitude,
      description,
      additionalInfo,
      imageUrl ?? null,
      JSON.stringify(schedules ?? []),
      createdBy,
    ],
  );

  return result.rows[0];
}

async function findEventById(eventId) {
  if (!isPostgresEnabled()) {
    return memoryStore.events.find((e) => e.id === eventId) || null;
  }

  const result = await query(
    `SELECT
      id,
      title,
      category,
      to_char(event_date, 'YYYY-MM-DD') AS "eventDate",
      to_char(event_time, 'HH24:MI') AS "eventTime",
      venue,
      location_text AS "locationText",
      latitude,
      longitude,
      description,
      additional_info AS "additionalInfo",
      image_url AS "imageUrl",
      schedules,
      created_by AS "createdBy",
      created_at AS "createdAt"
    FROM events
    WHERE id = $1
    LIMIT 1`,
    [eventId],
  );
  return result.rows[0] || null;
}

async function updateEventById(eventId, payload) {
  if (!isPostgresEnabled()) {
    const idx = memoryStore.events.findIndex((e) => e.id === eventId);
    if (idx === -1) return null;
    memoryStore.events[idx] = {
      ...memoryStore.events[idx],
      ...payload,
      id: eventId,
      createdBy: memoryStore.events[idx].createdBy,
      createdAt: memoryStore.events[idx].createdAt,
    };
    return memoryStore.events[idx];
  }

  const result = await query(
    `UPDATE events SET
      title = $2,
      category = $3,
      event_date = $4,
      event_time = $5,
      venue = $6,
      location_text = $7,
      latitude = $8,
      longitude = $9,
      description = $10,
      additional_info = $11,
      image_url = $12,
      schedules = $13::jsonb
    WHERE id = $1
    RETURNING
      id,
      title,
      category,
      to_char(event_date, 'YYYY-MM-DD') AS "eventDate",
      to_char(event_time, 'HH24:MI') AS "eventTime",
      venue,
      location_text AS "locationText",
      latitude,
      longitude,
      description,
      additional_info AS "additionalInfo",
      image_url AS "imageUrl",
      schedules,
      created_by AS "createdBy",
      created_at AS "createdAt"`,
    [
      eventId,
      payload.title,
      payload.category,
      payload.eventDate,
      payload.eventTime,
      payload.venue,
      payload.locationText,
      payload.latitude,
      payload.longitude,
      payload.description,
      payload.additionalInfo,
      payload.imageUrl ?? null,
      JSON.stringify(payload.schedules ?? []),
    ],
  );
  return result.rows[0] || null;
}

async function deleteEventById(eventId) {
  if (!isPostgresEnabled()) {
    const idx = memoryStore.events.findIndex((e) => e.id === eventId);
    if (idx !== -1) memoryStore.events.splice(idx, 1);
    return;
  }
  await query('DELETE FROM events WHERE id = $1', [eventId]);
}

async function listFeedPosts(userId) {
  if (!isPostgresEnabled()) {
    const followed = new Set(
      memoryStore.follows
        .filter((f) => f.followerId === userId)
        .map((f) => f.followedId),
    );
    return memoryStore.posts
      .filter((p) => p.userId === userId || followed.has(p.userId))
      .map((p) => {
        const likeCount = memoryStore.postLikes.filter((l) => l.postId === p.id).length;
        const commentCount = memoryStore.postComments.filter((c) => c.postId === p.id).length;
        const likedByMe = memoryStore.postLikes.some(
          (l) => l.postId === p.id && l.userId === userId,
        );
        return { ...p, likeCount, commentCount, likedByMe };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  const result = await query(
    `SELECT
      p.id,
      p.user_id AS "userId",
      COALESCE(NULLIF(u.username, ''), split_part(u.email, '@', 1)) AS "authorName",
      p.title,
      p.description,
      p.category,
      p.price,
      p.is_commission_available AS "isCommissionAvailable",
      p.tags,
      p.image_url AS "imageUrl",
      p.created_at AS "createdAt",
      COALESCE(lc.like_count, 0)::int AS "likeCount",
      COALESCE(cc.comment_count, 0)::int AS "commentCount",
      EXISTS(
        SELECT 1 FROM post_likes pl
        WHERE pl.post_id = p.id AND pl.user_id = $1
      ) AS "likedByMe"
    FROM posts p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN (
      SELECT post_id, COUNT(*) AS like_count
      FROM post_likes
      GROUP BY post_id
    ) lc ON lc.post_id = p.id
    LEFT JOIN (
      SELECT post_id, COUNT(*) AS comment_count
      FROM post_comments
      GROUP BY post_id
    ) cc ON cc.post_id = p.id
    WHERE p.user_id = $1
      OR p.user_id IN (
        SELECT followed_id FROM follows WHERE follower_id = $1
      )
    ORDER BY p.created_at DESC`,
    [userId],
  );
  return result.rows;
}

async function listMyPosts(userId) {
  if (!isPostgresEnabled()) {
    return memoryStore.posts
      .filter((p) => p.userId === userId)
      .map((p) => {
        const likeCount = memoryStore.postLikes.filter((l) => l.postId === p.id).length;
        const commentCount = memoryStore.postComments.filter((c) => c.postId === p.id).length;
        const likedByMe = memoryStore.postLikes.some(
          (l) => l.postId === p.id && l.userId === userId,
        );
        return { ...p, likeCount, commentCount, likedByMe };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  const result = await query(
    `SELECT
      p.id,
      p.user_id AS "userId",
      COALESCE(NULLIF(u.username, ''), split_part(u.email, '@', 1)) AS "authorName",
      p.title,
      p.description,
      p.category,
      p.price,
      p.is_commission_available AS "isCommissionAvailable",
      p.tags,
      p.image_url AS "imageUrl",
      p.created_at AS "createdAt",
      COALESCE(lc.like_count, 0)::int AS "likeCount",
      COALESCE(cc.comment_count, 0)::int AS "commentCount",
      EXISTS(
        SELECT 1 FROM post_likes pl
        WHERE pl.post_id = p.id AND pl.user_id = $1
      ) AS "likedByMe"
    FROM posts p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN (
      SELECT post_id, COUNT(*) AS like_count
      FROM post_likes
      GROUP BY post_id
    ) lc ON lc.post_id = p.id
    LEFT JOIN (
      SELECT post_id, COUNT(*) AS comment_count
      FROM post_comments
      GROUP BY post_id
    ) cc ON cc.post_id = p.id
    WHERE p.user_id = $1
    ORDER BY p.created_at DESC`,
    [userId],
  );
  return result.rows;
}

async function createPost({
  userId,
  title,
  description,
  category,
  price,
  isCommissionAvailable,
  tags,
  imageUrl,
}) {
  if (!isPostgresEnabled()) {
    const nextId = (memoryStore.posts.at(-1)?.id ?? 0) + 1;
    const post = {
      id: nextId,
      userId,
      authorName:
        memoryStore.users.find((u) => u.id === userId)?.username ??
        memoryStore.users.find((u) => u.id === userId)?.email ??
        'User',
      title,
      description,
      category,
      price,
      isCommissionAvailable,
      tags,
      imageUrl: imageUrl ?? null,
      createdAt: new Date().toISOString(),
      likeCount: 0,
      commentCount: 0,
      likedByMe: false,
    };
    memoryStore.posts.push(post);
    return post;
  }

  const result = await query(
    `INSERT INTO posts (
      user_id, title, description, category, price, is_commission_available, tags, image_url
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7::jsonb, $8
    )
    RETURNING
      id,
      user_id AS "userId",
      (
        SELECT COALESCE(NULLIF(username, ''), split_part(email, '@', 1))
        FROM users
        WHERE id = $1
      ) AS "authorName",
      title,
      description,
      category,
      price,
      is_commission_available AS "isCommissionAvailable",
      tags,
      image_url AS "imageUrl",
      created_at AS "createdAt",
      0::int AS "likeCount",
      0::int AS "commentCount",
      FALSE AS "likedByMe"`,
    [
      userId,
      title,
      description,
      category,
      price,
      isCommissionAvailable,
      JSON.stringify(tags ?? []),
      imageUrl ?? null,
    ],
  );
  return result.rows[0];
}

async function findPostVisibleToUser(postId, userId) {
  if (!isPostgresEnabled()) {
    const post = memoryStore.posts.find((p) => p.id === postId);
    if (!post) return null;
    const visible =
      post.userId === userId ||
      memoryStore.follows.some((f) => f.followerId === userId && f.followedId === post.userId);
    return visible ? post : null;
  }

  const result = await query(
    `SELECT p.id, p.user_id AS "userId"
     FROM posts p
     WHERE p.id = $1
       AND (
         p.user_id = $2
         OR p.user_id IN (SELECT followed_id FROM follows WHERE follower_id = $2)
       )
     LIMIT 1`,
    [postId, userId],
  );
  return result.rows[0] || null;
}

async function likePost(postId, userId) {
  if (!isPostgresEnabled()) {
    const exists = memoryStore.postLikes.some((l) => l.postId === postId && l.userId === userId);
    if (!exists) memoryStore.postLikes.push({ postId, userId, createdAt: new Date().toISOString() });
    return;
  }
  await query(
    `INSERT INTO post_likes (post_id, user_id)
     VALUES ($1, $2)
     ON CONFLICT (post_id, user_id) DO NOTHING`,
    [postId, userId],
  );
}

async function unlikePost(postId, userId) {
  if (!isPostgresEnabled()) {
    const idx = memoryStore.postLikes.findIndex((l) => l.postId === postId && l.userId === userId);
    if (idx !== -1) memoryStore.postLikes.splice(idx, 1);
    return;
  }
  await query('DELETE FROM post_likes WHERE post_id = $1 AND user_id = $2', [postId, userId]);
}

async function addPostComment(postId, userId, comment) {
  if (!isPostgresEnabled()) {
    const nextId = (memoryStore.postComments.at(-1)?.id ?? 0) + 1;
    memoryStore.postComments.push({
      id: nextId,
      postId,
      userId,
      comment,
      createdAt: new Date().toISOString(),
    });
    return;
  }
  await query(
    `INSERT INTO post_comments (post_id, user_id, comment)
     VALUES ($1, $2, $3)`,
    [postId, userId, comment],
  );
}

async function listPostComments(postId) {
  if (!isPostgresEnabled()) {
    return memoryStore.postComments
      .filter((c) => c.postId === postId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map((c) => {
        const user = memoryStore.users.find((u) => u.id === c.userId);
        const authorName = user?.username || user?.email || 'User';
        return {
          id: c.id,
          postId: c.postId,
          userId: c.userId,
          authorName,
          comment: c.comment,
          createdAt: c.createdAt,
        };
      });
  }

  const result = await query(
    `SELECT
      c.id,
      c.post_id AS "postId",
      c.user_id AS "userId",
      COALESCE(NULLIF(u.username, ''), split_part(u.email, '@', 1)) AS "authorName",
      c.comment,
      c.created_at AS "createdAt"
    FROM post_comments c
    JOIN users u ON u.id = c.user_id
    WHERE c.post_id = $1
    ORDER BY c.created_at ASC, c.id ASC`,
    [postId],
  );
  return result.rows;
}

module.exports = {
  listArtists,
  listProjects,
  listConversations,
  listEvents,
  createEvent,
  findEventById,
  updateEventById,
  deleteEventById,
  listFeedPosts,
  listMyPosts,
  createPost,
  findPostVisibleToUser,
  likePost,
  unlikePost,
  addPostComment,
  listPostComments,
};
