const { isPostgresEnabled, query } = require('../config/database');
const { memoryStore } = require('../data/memoryStore');

function _safeDays(raw, fallback = 30) {
  const n = Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(365, n);
}

function _dayKey(dt) {
  const d = dt instanceof Date ? dt : new Date(dt);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate(),
  ).padStart(2, '0')}`;
}

function _rangeDayKeys(days) {
  const out = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    out.push(_dayKey(d));
  }
  return out;
}

async function recordPostView({ postId, viewerId }) {
  const pid = Number(postId);
  const vid = viewerId == null ? null : Number(viewerId);
  if (!Number.isFinite(pid) || pid <= 0) return { recorded: false };

  if (!isPostgresEnabled()) {
    const post = memoryStore.posts.find((p) => Number(p.id) === pid);
    if (!post) return { recorded: false };
    const ownerId = Number(post.userId);
    if (vid != null && Number.isFinite(vid) && ownerId === vid) {
      return { recorded: false };
    }
    const nextId = (memoryStore.postViews.at(-1)?.id ?? 0) + 1;
    memoryStore.postViews.push({
      id: nextId,
      postId: pid,
      postOwnerId: ownerId,
      viewerId: vid != null && Number.isFinite(vid) ? vid : null,
      createdAt: new Date().toISOString(),
    });
    return { recorded: true };
  }

  // Resolve owner id in DB.
  const ownerRes = await query(
    'SELECT user_id AS uid FROM posts WHERE id = $1 LIMIT 1',
    [pid],
  );
  const ownerId = ownerRes.rows[0]?.uid;
  if (!ownerId) return { recorded: false };
  if (vid != null && Number.isFinite(vid) && Number(ownerId) === Number(vid)) {
    return { recorded: false };
  }

  await query(
    `INSERT INTO post_views (post_id, post_owner_id, viewer_id)
     VALUES ($1, $2, $3)`,
    [pid, Number(ownerId), vid != null && Number.isFinite(vid) ? Number(vid) : null],
  );
  return { recorded: true };
}

async function getMyAnalytics(userId, { days = 30 } = {}) {
  const uid = Number(userId);
  if (!Number.isFinite(uid) || uid <= 0) return null;
  const windowDays = _safeDays(days, 30);

  if (!isPostgresEnabled()) {
    const since = Date.now() - windowDays * 86400000;
    const myPosts = memoryStore.posts.filter((p) => Number(p.userId) === uid);
    const myPostIds = new Set(myPosts.map((p) => Number(p.id)));
    const viewsAll = memoryStore.postViews.filter((v) => Number(v.postOwnerId) === uid);
    const viewsWindow = viewsAll.filter((v) => new Date(v.createdAt).getTime() >= since);

    const commAll = memoryStore.commissions.filter((c) => Number(c.artistId) === uid);
    const completed = commAll.filter((c) => String(c.status) === 'completed');
    const completedCount = completed.length;
    const revenue = completed.reduce((sum, c) => sum + Number(c.totalAmount ?? 0), 0);
    const patrons = new Map();
    for (const c of completed) {
      const pid = Number(c.patronId);
      patrons.set(pid, (patrons.get(pid) ?? 0) + 1);
    }
    const uniquePatrons = patrons.size;
    const returningPatrons = [...patrons.values()].filter((n) => n >= 2).length;
    const repeatPatronRate = uniquePatrons > 0 ? returningPatrons / uniquePatrons : 0;

    const dayKeys = _rangeDayKeys(windowDays);
    const viewCountByDay = new Map(dayKeys.map((k) => [k, 0]));
    for (const v of viewsWindow) {
      const k = _dayKey(v.createdAt);
      if (viewCountByDay.has(k)) viewCountByDay.set(k, Number(viewCountByDay.get(k)) + 1);
    }
    const viewTrend = dayKeys.map((k) => ({ day: k, value: Number(viewCountByDay.get(k) ?? 0) }));

    const commDayMap = new Map(dayKeys.map((k) => [k, { count: 0, revenue: 0 }]));
    const sinceWindow = Date.now() - windowDays * 86400000;
    for (const c of completed) {
      const t = new Date(c.completedAt ?? c.createdAt ?? 0).getTime();
      if (!Number.isFinite(t) || t < sinceWindow) continue;
      const k = _dayKey(new Date(t));
      if (!commDayMap.has(k)) continue;
      const cur = commDayMap.get(k);
      cur.count += 1;
      cur.revenue += Number(c.totalAmount ?? 0);
      commDayMap.set(k, cur);
    }
    const completedTrend = dayKeys.map((k) => ({
      day: k,
      count: Number(commDayMap.get(k)?.count ?? 0),
      revenue: Math.round(Number(commDayMap.get(k)?.revenue ?? 0) * 100) / 100,
    }));

    return {
      rangeDays: windowDays,
      postViews: {
        total: viewsAll.length,
        lastNDays: viewsWindow.length,
        uniquePostsViewed: new Set(viewsAll.map((v) => Number(v.postId))).size,
        myPostsCount: myPostIds.size,
        trendByDay: viewTrend,
      },
      commissions: {
        completedCount,
        revenueTotal: Math.round(revenue * 100) / 100,
        completedTrendByDay: completedTrend,
      },
      cohorts: {
        uniquePatrons,
        returningPatrons,
        repeatPatronRate,
      },
      sales: {
        note: 'Merchandise orders are not implemented yet.',
      },
    };
  }

  const sinceExpr = `NOW() - ($2::int * interval '1 day')`;

  const views = await query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE created_at >= ${sinceExpr})::int AS "lastNDays",
       COUNT(DISTINCT post_id)::int AS "uniquePostsViewed"
     FROM post_views
     WHERE post_owner_id = $1`,
    [uid, windowDays],
  );

  const postsCount = await query(
    'SELECT COUNT(*)::int AS c FROM posts WHERE user_id = $1',
    [uid],
  );

  const comm = await query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'completed')::int AS "completedCount",
       COALESCE(SUM(total_amount) FILTER (WHERE status = 'completed' AND escrow_status = 'released'), 0)::numeric(12,2) AS "revenueTotal"
     FROM commissions
     WHERE artist_id = $1`,
    [uid],
  );

  const viewTrend = await query(
    `SELECT
       TO_CHAR(gs.day, 'YYYY-MM-DD') AS day,
       COALESCE(v.cnt, 0)::int AS value
     FROM generate_series(
       (CURRENT_DATE - ($2::int - 1) * interval '1 day')::date,
       CURRENT_DATE::date,
       interval '1 day'
     ) AS gs(day)
     LEFT JOIN (
       SELECT DATE(created_at) AS day, COUNT(*) AS cnt
       FROM post_views
       WHERE post_owner_id = $1
         AND created_at >= NOW() - ($2::int * interval '1 day')
       GROUP BY DATE(created_at)
     ) v ON v.day = gs.day
     ORDER BY gs.day ASC`,
    [uid, windowDays],
  );

  const completedTrend = await query(
    `SELECT
       TO_CHAR(gs.day, 'YYYY-MM-DD') AS day,
       COALESCE(c.cnt, 0)::int AS count,
       COALESCE(c.revenue, 0)::numeric(12,2) AS revenue
     FROM generate_series(
       (CURRENT_DATE - ($2::int - 1) * interval '1 day')::date,
       CURRENT_DATE::date,
       interval '1 day'
     ) AS gs(day)
     LEFT JOIN (
       SELECT
         DATE(COALESCE(completed_at, created_at)) AS day,
         COUNT(*) AS cnt,
         SUM(total_amount) FILTER (WHERE escrow_status = 'released') AS revenue
       FROM commissions
       WHERE artist_id = $1
         AND status = 'completed'
         AND COALESCE(completed_at, created_at) >= NOW() - ($2::int * interval '1 day')
       GROUP BY DATE(COALESCE(completed_at, created_at))
     ) c ON c.day = gs.day
     ORDER BY gs.day ASC`,
    [uid, windowDays],
  );

  const cohorts = await query(
    `WITH patron_counts AS (
       SELECT patron_id, COUNT(*)::int AS completed_count
       FROM commissions
       WHERE artist_id = $1
         AND status = 'completed'
       GROUP BY patron_id
     )
     SELECT
       COUNT(*)::int AS "uniquePatrons",
       COUNT(*) FILTER (WHERE completed_count >= 2)::int AS "returningPatrons"
     FROM patron_counts`,
    [uid],
  );
  const uniquePatrons = Number(cohorts.rows[0]?.uniquePatrons ?? 0);
  const returningPatrons = Number(cohorts.rows[0]?.returningPatrons ?? 0);
  const repeatPatronRate = uniquePatrons > 0 ? returningPatrons / uniquePatrons : 0;

  return {
    rangeDays: windowDays,
    postViews: {
      total: views.rows[0]?.total ?? 0,
      lastNDays: views.rows[0]?.lastNDays ?? 0,
      uniquePostsViewed: views.rows[0]?.uniquePostsViewed ?? 0,
      myPostsCount: postsCount.rows[0]?.c ?? 0,
      trendByDay: viewTrend.rows.map((r) => ({
        day: r.day,
        value: Number(r.value ?? 0),
      })),
    },
    commissions: {
      completedCount: comm.rows[0]?.completedCount ?? 0,
      revenueTotal: Number(comm.rows[0]?.revenueTotal ?? 0),
      completedTrendByDay: completedTrend.rows.map((r) => ({
        day: r.day,
        count: Number(r.count ?? 0),
        revenue: Number(r.revenue ?? 0),
      })),
    },
    cohorts: {
      uniquePatrons,
      returningPatrons,
      repeatPatronRate,
    },
    sales: {
      note: 'Merchandise orders are not implemented yet.',
    },
  };
}

async function getAdminHealthAnalytics({ days = 30 } = {}) {
  const windowDays = _safeDays(days, 30);

  if (!isPostgresEnabled()) {
    const now = Date.now();
    const since = now - windowDays * 86400000;
    const users = memoryStore.users.length;
    const posts = memoryStore.posts.length;
    const pendingReports = memoryStore.reports.filter((r) => String(r.status) === 'pending').length;
    const openAppeals = memoryStore.moderationAppeals.filter((a) => String(a.status) === 'open').length;
    const tempBansActive = memoryStore.users.filter((u) => {
      const t = u.bannedUntil ? new Date(u.bannedUntil).getTime() : NaN;
      return Number.isFinite(t) && t > now;
    }).length;
    const permanentBans = memoryStore.users.filter((u) => u.permanentlyBannedAt != null).length;
    const dayKeys = _rangeDayKeys(windowDays);
    const newUsersByDay = dayKeys.map((d) => ({ day: d, value: 0 }));
    const reportsByDay = dayKeys.map((d) => ({ day: d, value: 0 }));
    const appealsByDay = dayKeys.map((d) => ({ day: d, value: 0 }));
    // memoryStore users currently lacks createdAt for legacy demo users; keep zeros for users trend.
    for (const r of memoryStore.reports) {
      const t = new Date(r.createdAt).getTime();
      if (!Number.isFinite(t) || t < since) continue;
      const k = _dayKey(new Date(t));
      const idx = dayKeys.indexOf(k);
      if (idx >= 0) reportsByDay[idx].value += 1;
    }
    for (const a of memoryStore.moderationAppeals) {
      const t = new Date(a.createdAt).getTime();
      if (!Number.isFinite(t) || t < since) continue;
      const k = _dayKey(new Date(t));
      const idx = dayKeys.indexOf(k);
      if (idx >= 0) appealsByDay[idx].value += 1;
    }
    return {
      rangeDays: windowDays,
      totals: {
        users,
        posts,
        pendingReports,
        openAppeals,
        tempBansActive,
        permanentBans,
      },
      trends: {
        newUsersByDay,
        reportsByDay,
        appealsByDay,
      },
    };
  }

  const totals = await query(
    `SELECT
       (SELECT COUNT(*)::int FROM users) AS users,
       (SELECT COUNT(*)::int FROM posts) AS posts,
       (SELECT COUNT(*)::int FROM reports WHERE status = 'pending') AS "pendingReports",
       (SELECT COUNT(*)::int FROM moderation_appeals WHERE status = 'open') AS "openAppeals",
       (SELECT COUNT(*)::int FROM users WHERE banned_until > NOW()) AS "tempBansActive",
       (SELECT COUNT(*)::int FROM users WHERE permanently_banned_at IS NOT NULL) AS "permanentBans"`,
  );

  const newUsersByDay = await query(
    `SELECT
       TO_CHAR(gs.day, 'YYYY-MM-DD') AS day,
       COALESCE(x.cnt, 0)::int AS value
     FROM generate_series(
       (CURRENT_DATE - ($1::int - 1) * interval '1 day')::date,
       CURRENT_DATE::date,
       interval '1 day'
     ) AS gs(day)
     LEFT JOIN (
       SELECT DATE(created_at) AS day, COUNT(*) AS cnt
       FROM users
       WHERE created_at >= NOW() - ($1::int * interval '1 day')
       GROUP BY DATE(created_at)
     ) x ON x.day = gs.day
     ORDER BY gs.day ASC`,
    [windowDays],
  );

  const reportsByDay = await query(
    `SELECT
       TO_CHAR(gs.day, 'YYYY-MM-DD') AS day,
       COALESCE(x.cnt, 0)::int AS value
     FROM generate_series(
       (CURRENT_DATE - ($1::int - 1) * interval '1 day')::date,
       CURRENT_DATE::date,
       interval '1 day'
     ) AS gs(day)
     LEFT JOIN (
       SELECT DATE(created_at) AS day, COUNT(*) AS cnt
       FROM reports
       WHERE created_at >= NOW() - ($1::int * interval '1 day')
       GROUP BY DATE(created_at)
     ) x ON x.day = gs.day
     ORDER BY gs.day ASC`,
    [windowDays],
  );

  const appealsByDay = await query(
    `SELECT
       TO_CHAR(gs.day, 'YYYY-MM-DD') AS day,
       COALESCE(x.cnt, 0)::int AS value
     FROM generate_series(
       (CURRENT_DATE - ($1::int - 1) * interval '1 day')::date,
       CURRENT_DATE::date,
       interval '1 day'
     ) AS gs(day)
     LEFT JOIN (
       SELECT DATE(created_at) AS day, COUNT(*) AS cnt
       FROM moderation_appeals
       WHERE created_at >= NOW() - ($1::int * interval '1 day')
       GROUP BY DATE(created_at)
     ) x ON x.day = gs.day
     ORDER BY gs.day ASC`,
    [windowDays],
  );

  return {
    rangeDays: windowDays,
    totals: totals.rows[0] || {},
    trends: {
      newUsersByDay: newUsersByDay.rows.map((r) => ({ day: r.day, value: Number(r.value ?? 0) })),
      reportsByDay: reportsByDay.rows.map((r) => ({ day: r.day, value: Number(r.value ?? 0) })),
      appealsByDay: appealsByDay.rows.map((r) => ({ day: r.day, value: Number(r.value ?? 0) })),
    },
  };
}

module.exports = {
  recordPostView,
  getMyAnalytics,
  getAdminHealthAnalytics,
};

