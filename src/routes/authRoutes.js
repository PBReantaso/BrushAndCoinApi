const express = require('express');
const authController = require('../controllers/authController');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();

router.post('/signup', authController.signup);
router.post('/login', authController.login);
router.post('/refresh', authController.refresh);
router.get('/me', requireAuth, authController.me);
router.post('/delete', requireAuth, authController.deleteAccount);

module.exports = { authRoutes: router };
