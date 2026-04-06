const adminReportsService = require('../services/adminReportsService');

async function listReports(req, res, next) {
  try {
    const merged = { ...(req.query ?? {}), ...(req.body ?? {}) };
    const payload = await adminReportsService.listReports(merged);
    res.json(payload);
  } catch (error) {
    next(error);
  }
}

async function resolveReport(req, res, next) {
  try {
    const payload = await adminReportsService.resolveReport(
      req.params.id,
      req.body ?? {},
      req.user,
    );
    res.json(payload);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listReports,
  resolveReport,
};
