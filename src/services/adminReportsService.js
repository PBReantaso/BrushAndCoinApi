const reportsRepository = require('../repositories/reportsRepository');

async function listReports(query) {
  const raw = query?.status;
  const status =
    raw == null || raw === ''
      ? 'all'
      : String(raw).trim().toLowerCase();
  const allowed = new Set(['all', 'pending', 'resolved', 'dismissed']);
  if (!allowed.has(status)) {
    const error = new Error('Invalid status filter.');
    error.statusCode = 400;
    throw error;
  }
  const reports = await reportsRepository.listReportsForAdmin({ status });
  return { reports };
}

async function resolveReport(reportId, input) {
  const id = Number(reportId);
  if (!Number.isFinite(id) || id <= 0) {
    const error = new Error('Invalid report id.');
    error.statusCode = 400;
    throw error;
  }
  const st = String(input?.status ?? '').trim().toLowerCase();
  if (st !== 'resolved' && st !== 'dismissed') {
    const error = new Error('Status must be "resolved" or "dismissed".');
    error.statusCode = 400;
    throw error;
  }
  const resolutionNote =
    input?.resolutionNote == null
      ? null
      : String(input.resolutionNote).trim().slice(0, 2000);
  const report = await reportsRepository.resolveReportById(id, {
    status: st,
    resolutionNote: resolutionNote || null,
  });
  if (!report) {
    const error = new Error('Report not found.');
    error.statusCode = 404;
    throw error;
  }
  return { report };
}

module.exports = {
  listReports,
  resolveReport,
};
