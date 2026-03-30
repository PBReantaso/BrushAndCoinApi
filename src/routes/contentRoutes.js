const express = require('express');
const contentController = require('../controllers/contentController');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();

router.get('/dashboard', requireAuth, contentController.dashboard);
router.get('/artists', requireAuth, contentController.artists);
router.get('/projects', requireAuth, contentController.projects);
router.get('/messages', requireAuth, contentController.messages);

module.exports = { contentRoutes: router };
