const express = require('express');
const analyticsController = require('../controllers/analyticsController');
const { requireAuth } = require('../middleware/requireAuth');
const { requireAdmin } = require('../middleware/requireAdmin');

const router = express.Router();

// Only current signed-in user can access their analytics.
router.get('/analytics/me', requireAuth, analyticsController.myAnalytics);
router.post('/analytics/me', requireAuth, analyticsController.myAnalytics);
router.get('/analytics/me/export.csv', requireAuth, analyticsController.exportMyAnalyticsCsv);

// Record a view for a post (used for analytics). Viewer is inferred from token.
router.post('/analytics/posts/:id/view', requireAuth, analyticsController.recordPostView);

// Admin health dashboard metrics.
router.get('/admin/analytics/health', requireAuth, requireAdmin, analyticsController.adminHealthDashboard);
router.post('/admin/analytics/health/query', requireAuth, requireAdmin, analyticsController.adminHealthDashboard);

module.exports = { analyticsRoutes: router };

