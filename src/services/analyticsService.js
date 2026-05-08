const analyticsRepository = require('../repositories/analyticsRepository');

async function getMyAnalytics(input, user) {
  const uid = Number(user?.id);
  if (!Number.isFinite(uid) || uid <= 0) {
    const err = new Error('Authentication required.');
    err.statusCode = 401;
    throw err;
  }
  const daysRaw = input?.days ?? input?.rangeDays ?? input?.range;
  const days = Number.parseInt(String(daysRaw ?? ''), 10);
  const payload = await analyticsRepository.getMyAnalytics(uid, {
    days: Number.isFinite(days) ? days : 30,
  });
  return { analytics: payload };
}

async function recordPostView(postId, user) {
  const uid = Number(user?.id);
  if (!Number.isFinite(uid) || uid <= 0) {
    const err = new Error('Authentication required.');
    err.statusCode = 401;
    throw err;
  }
  const result = await analyticsRepository.recordPostView({
    postId,
    viewerId: uid,
  });
  return result;
}

function _toCsvRow(cols) {
  return cols
    .map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`)
    .join(',');
}

async function exportMyAnalyticsCsv(input, user) {
  const uid = Number(user?.id);
  if (!Number.isFinite(uid) || uid <= 0) {
    const err = new Error('Authentication required.');
    err.statusCode = 401;
    throw err;
  }
  const daysRaw = input?.days ?? input?.rangeDays ?? input?.range;
  const days = Number.parseInt(String(daysRaw ?? ''), 10);
  const analytics = await analyticsRepository.getMyAnalytics(uid, {
    days: Number.isFinite(days) ? days : 30,
  });

  const out = [];
  out.push(_toCsvRow(['section', 'metric', 'value']));
  out.push(_toCsvRow(['post_views', 'total', analytics?.postViews?.total ?? 0]));
  out.push(_toCsvRow(['post_views', `last_${analytics?.rangeDays ?? 30}_days`, analytics?.postViews?.lastNDays ?? 0]));
  out.push(_toCsvRow(['commissions', 'completed_count', analytics?.commissions?.completedCount ?? 0]));
  out.push(_toCsvRow(['commissions', 'revenue_total', analytics?.commissions?.revenueTotal ?? 0]));
  out.push(_toCsvRow(['cohorts', 'unique_patrons', analytics?.cohorts?.uniquePatrons ?? 0]));
  out.push(_toCsvRow(['cohorts', 'returning_patrons', analytics?.cohorts?.returningPatrons ?? 0]));
  out.push(_toCsvRow(['cohorts', 'repeat_patron_rate', analytics?.cohorts?.repeatPatronRate ?? 0]));

  out.push('');
  out.push(_toCsvRow(['day', 'views']));
  for (const row of analytics?.postViews?.trendByDay || []) {
    out.push(_toCsvRow([row.day, row.value]));
  }
  out.push('');
  out.push(_toCsvRow(['day', 'completed_commissions', 'released_revenue']));
  for (const row of analytics?.commissions?.completedTrendByDay || []) {
    out.push(_toCsvRow([row.day, row.count, row.revenue]));
  }
  return { csv: out.join('\n') };
}

async function getAdminHealthAnalytics(input, user) {
  const uid = Number(user?.id);
  if (!Number.isFinite(uid) || uid <= 0 || user?.isAdmin !== true) {
    const err = new Error('Admin access required.');
    err.statusCode = 403;
    throw err;
  }
  const daysRaw = input?.days ?? input?.rangeDays ?? input?.range;
  const days = Number.parseInt(String(daysRaw ?? ''), 10);
  const dashboard = await analyticsRepository.getAdminHealthAnalytics({
    days: Number.isFinite(days) ? days : 30,
  });
  return { dashboard };
}

module.exports = {
  getMyAnalytics,
  recordPostView,
  exportMyAnalyticsCsv,
  getAdminHealthAnalytics,
};

