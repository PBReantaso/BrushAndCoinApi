const analyticsService = require('../services/analyticsService');

async function myAnalytics(req, res, next) {
  try {
    const merged = { ...(req.query ?? {}), ...(req.body ?? {}) };
    const payload = await analyticsService.getMyAnalytics(merged, req.user);
    res.json(payload);
  } catch (e) {
    next(e);
  }
}

async function recordPostView(req, res, next) {
  try {
    const payload = await analyticsService.recordPostView(req.params.id, req.user);
    res.json(payload);
  } catch (e) {
    next(e);
  }
}

async function exportMyAnalyticsCsv(req, res, next) {
  try {
    const merged = { ...(req.query ?? {}), ...(req.body ?? {}) };
    const payload = await analyticsService.exportMyAnalyticsCsv(merged, req.user);
    const days = Number.parseInt(String(merged?.days ?? ''), 10);
    const safeDays = Number.isFinite(days) && days > 0 ? days : 30;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="my-analytics-${safeDays}d.csv"`,
    );
    res.send(payload.csv);
  } catch (e) {
    next(e);
  }
}

async function adminHealthDashboard(req, res, next) {
  try {
    const merged = { ...(req.query ?? {}), ...(req.body ?? {}) };
    const payload = await analyticsService.getAdminHealthAnalytics(merged, req.user);
    res.json(payload);
  } catch (e) {
    next(e);
  }
}

module.exports = {
  myAnalytics,
  recordPostView,
  exportMyAnalyticsCsv,
  adminHealthDashboard,
};

