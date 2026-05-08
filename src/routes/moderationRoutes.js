const express = require('express');
const moderationController = require('../controllers/moderationController');
const { requireAuth } = require('../middleware/requireAuth');
const { requireAdmin } = require('../middleware/requireAdmin');

const router = express.Router();

// User-facing transparency/history + disputes
router.get('/moderation/history/me', requireAuth, moderationController.myEnforcementHistory);
router.get('/moderation/appeals/me', requireAuth, moderationController.myAppeals);
router.post('/moderation/appeals', requireAuth, moderationController.submitMyAppeal);

// Admin-facing audit + appeal triage
router.get('/admin/moderation/actions', requireAuth, requireAdmin, moderationController.adminActions);
router.get('/admin/moderation/appeals', requireAuth, requireAdmin, moderationController.adminAppeals);
router.post('/admin/moderation/appeals/query', requireAuth, requireAdmin, moderationController.adminAppeals);
router.patch('/admin/moderation/appeals/:id', requireAuth, requireAdmin, moderationController.resolveAdminAppeal);

module.exports = { moderationRoutes: router };

