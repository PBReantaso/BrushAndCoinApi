const notificationsService = require('../services/notificationsService');

async function listNotifications(req, res, next) {
  try {
    const payload = await notificationsService.listForUser(req.user.id, req.query ?? {});
    return res.json(payload);
  } catch (err) {
    return next(err);
  }
}

async function getUnreadCount(req, res, next) {
  try {
    const payload = await notificationsService.unreadCount(req.user.id);
    return res.json(payload);
  } catch (err) {
    return next(err);
  }
}

async function markRead(req, res, next) {
  try {
    const payload = await notificationsService.markRead(req.params.id, req.user.id);
    return res.json(payload);
  } catch (err) {
    return next(err);
  }
}

async function markAllRead(req, res, next) {
  try {
    const payload = await notificationsService.markAllRead(req.user.id);
    return res.json(payload);
  } catch (err) {
    return next(err);
  }
}

async function registerDevice(req, res, next) {
  try {
    const payload = await notificationsService.registerDevice(req.user.id, req.body ?? {});
    return res.json(payload);
  } catch (err) {
    return next(err);
  }
}

async function unregisterDevice(req, res, next) {
  try {
    const payload = await notificationsService.unregisterDevice(req.user.id, req.body ?? {});
    return res.json(payload);
  } catch (err) {
    return next(err);
  }
}

/** Admin / ops: set ADMIN_NOTIFICATION_SECRET and send header x-admin-secret */
async function createSystemAnnouncement(req, res, next) {
  try {
    const expected = process.env.ADMIN_NOTIFICATION_SECRET;
    if (!expected || String(req.get('x-admin-secret') ?? '') !== expected) {
      return res.status(403).json({ message: 'Forbidden.' });
    }
    const payload = await notificationsService.broadcastSystemAnnouncement(req.body ?? {});
    return res.status(201).json(payload);
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
  registerDevice,
  unregisterDevice,
  createSystemAnnouncement,
};
