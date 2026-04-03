const express = require('express');
const notificationsController = require('../controllers/notificationsController');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();

router.get('/notifications', requireAuth, notificationsController.listNotifications);
router.get('/notifications/unread-count', requireAuth, notificationsController.getUnreadCount);
router.post(
  '/notifications/system-announcements',
  notificationsController.createSystemAnnouncement,
);
router.patch('/notifications/:id/read', requireAuth, notificationsController.markRead);
router.post('/push-devices', requireAuth, notificationsController.registerDevice);
router.delete('/push-devices', requireAuth, notificationsController.unregisterDevice);

module.exports = { notificationsRoutes: router };
