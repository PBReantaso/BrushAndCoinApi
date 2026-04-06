const express = require('express');
const reportsController = require('../controllers/reportsController');
const adminReportsController = require('../controllers/adminReportsController');
const { requireAuth } = require('../middleware/requireAuth');
const { requireAdmin } = require('../middleware/requireAdmin');

const router = express.Router();

router.post('/reports/post', requireAuth, reportsController.reportPost);
router.post('/reports/user', requireAuth, reportsController.reportUser);

router.get(
  '/admin/reports',
  requireAuth,
  requireAdmin,
  adminReportsController.listReports,
);
router.post(
  '/admin/reports/query',
  requireAuth,
  requireAdmin,
  adminReportsController.listReports,
);
router.patch(
  '/admin/reports/:id',
  requireAuth,
  requireAdmin,
  adminReportsController.resolveReport,
);

module.exports = { reportsRoutes: router };
